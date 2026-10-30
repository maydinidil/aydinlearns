-- pipeline/edge/ledgerloop_edge_clean.sql (family: SQL-PAT-02 and the cleaning items on ledgerloop_raw; ERR-LOG-36, -40, -41, -18 and
-- Q-02-01 to Q-02-07)
-- Sprint 8 (S8-07 as amended by S8-C14): the edge schema of the raw-data items on ledgerloop_raw. It is to ledgerloop_raw what
-- voltmarkt_edge_clean and mailvora_edge_clean are to their raw schemas: the same sixteen table names and columns (payments.attempted_at
-- a UTC TIMESTAMPTZ, subscription_events with no key), with raw's quirks on the copies of accounts, subscriptions,
-- subscription_events, invoices and payments. Planted (pipeline/tests/test_edge_pat.py holds each):
--   Q-02-01: subscription 4's expansion of 2024-11-19 sent twice with the same recorded_at, so a dedup by recorded_at alone ties;
--   its expansion of 2025-06-17 and subscription 6's churn of 2025-07-10 each sent twice, the copy recorded minutes later, as raw's
--   are. Each copy repeats the business key (subscription, type, date, amount) under an event ID after the last original. Counted
--   twice, the churn leaves subscription 6 below zero;
--   Q-02-02: subscription 3's churn of 2025-04-08 recorded on 2025-06-02, so reported and restated MRR differ at the April and May
--   2025 month ends;
--   Q-02-03: every subscription and invoice says EUR, though account 1 is in GB and account 3 in CH, whose amounts stay in GBP and CHF;
--   Q-02-04: payment attempts are UTC instants; subscription 1's invoice of 2025-03-14 fails at its first attempt and is paid by a
--   retry at 23:30 UTC on 17 March, which is 18 March in Brussels;
--   Q-02-05: subscription 5, which runs, ends on 9999-12-31;
--   Q-02-06: the segments are spelled midmarket, smb, Small Business, Mid-Market, SMB and Enterprise (no spelling raw lacks);
--   Q-02-07: two test accounts after the last real one, one flagged is_test and one only named like a test; they hold no subscription.
-- Once cleaned by those rules (one row per business key, the lowest event_id kept; the currency from the country; a missing end
-- date for the sentinel; the clean segment spellings; no test account), the rows follow S8-02, S8-03, S8-05 and S8-06 as ledgerloop
-- does: the events sum to each subscription's mrr_local, the invoices bill the MRR in force, every start and renewal is invoiced.
-- The build's own SQL below makes the invoices and payments from the deduplicated events, and the usage weeks from the
-- subscriptions with their real end dates; plans, fx_rates and the three cost tables are ledgerloop_raw's own rows.
CREATE SCHEMA ledgerloop_edge_clean;
CREATE TABLE ledgerloop_edge_clean.accounts AS SELECT * FROM ledgerloop_raw.accounts LIMIT 0;
INSERT INTO ledgerloop_edge_clean.accounts VALUES
  (1, 'Pennine Foods Ltd', 'GB', 'midmarket', '51-200', 'wholesale', 'partner', TIMESTAMP '2021-06-14 10:20:00', false),
  (2, 'Kempen Accountants BV', 'BE', 'smb', '1-10', 'professional_services', 'referral', TIMESTAMP '2022-09-05 09:30:00', false),
  (3, 'Leman Optics AG', 'CH', 'Enterprise', '501-1000', 'manufacturing', 'events', TIMESTAMP '2024-04-08 10:00:00', false),
  (4, 'Noorder Retail B.V.', 'NL', 'Small Business', '11-50', 'retail', 'paid_search', TIMESTAMP '2024-05-13 10:15:00', false),
  (5, 'Isar Bouw GmbH', 'DE', 'Mid-Market', '51-200', 'construction', 'partner', TIMESTAMP '2024-09-02 13:40:00', false),
  (6, 'Seine Media SAS', 'FR', 'SMB', '1-10', 'technology', 'paid_social', TIMESTAMP '2025-03-10 09:00:00', false),
  (7, 'LedgerLoop Demo BE', 'BE', 'SMB', '1-10', 'technology', 'organic', TIMESTAMP '2023-11-06 11:00:00', true),
  (8, 'Test Bakkerij Gent', 'BE', 'smb', '1-10', 'technology', 'organic', TIMESTAMP '2024-06-20 14:00:00', false);
CREATE TABLE ledgerloop_edge_clean.plans AS SELECT * FROM ledgerloop_raw.plans;
CREATE TABLE ledgerloop_edge_clean.subscriptions AS SELECT * FROM ledgerloop_raw.subscriptions LIMIT 0;
INSERT INTO ledgerloop_edge_clean.subscriptions VALUES
  (1, 1, 3, 'monthly', 'EUR', DATE '2021-06-14', NULL, 769.00),
  (2, 2, 2, 'monthly', 'EUR', DATE '2022-09-05', NULL, 349.00),
  (3, 3, 4, 'monthly', 'EUR', DATE '2024-04-08', DATE '2025-04-08', 2299.00),
  (4, 4, 3, 'monthly', 'EUR', DATE '2024-05-13', NULL, 1490.00),
  (5, 5, 3, 'annual', 'EUR', DATE '2024-09-02', DATE '9999-12-31', 756.50),
  (6, 6, 2, 'monthly', 'EUR', DATE '2025-03-10', DATE '2025-07-10', 349.00);
CREATE TABLE ledgerloop_edge_clean.subscription_events AS SELECT * FROM ledgerloop_raw.subscription_events LIMIT 0;
INSERT INTO ledgerloop_edge_clean.subscription_events VALUES
  (1, 1, 1, 'opening', DATE '2024-01-01', 769.00, TIMESTAMP '2024-01-01 00:00:00'),
  (2, 2, 2, 'opening', DATE '2024-01-01', 290.00, TIMESTAMP '2024-01-01 00:00:00'),
  (3, 3, 3, 'new', DATE '2024-04-08', 2299.00, TIMESTAMP '2024-04-08 10:40:00'),
  (4, 4, 4, 'new', DATE '2024-05-13', 890.00, TIMESTAMP '2024-05-13 11:00:00'),
  (5, 5, 5, 'new', DATE '2024-09-02', 756.50, TIMESTAMP '2024-09-02 14:20:00'),
  (6, 4, 4, 'expansion', DATE '2024-11-19', 300.00, TIMESTAMP '2024-11-19 10:15:00'),
  (7, 2, 2, 'expansion', DATE '2025-02-05', 59.00, TIMESTAMP '2025-02-05 06:20:00'),
  (8, 6, 6, 'new', DATE '2025-03-10', 349.00, TIMESTAMP '2025-03-10 09:40:00'),
  (9, 3, 3, 'churn', DATE '2025-04-08', -2299.00, TIMESTAMP '2025-06-02 14:00:00'),
  (10, 4, 4, 'expansion', DATE '2025-06-17', 300.00, TIMESTAMP '2025-06-17 13:05:00'),
  (11, 6, 6, 'churn', DATE '2025-07-10', -349.00, TIMESTAMP '2025-07-10 06:45:00'),
  (12, 4, 4, 'expansion', DATE '2024-11-19', 300.00, TIMESTAMP '2024-11-19 10:15:00'),
  (13, 4, 4, 'expansion', DATE '2025-06-17', 300.00, TIMESTAMP '2025-06-17 13:09:00'),
  (14, 6, 6, 'churn', DATE '2025-07-10', -349.00, TIMESTAMP '2025-07-10 06:47:00');
-- An invoice at each start and renewal in the window while the subscription runs (the sentinel read as no end), at the MRR in force
-- from the events counted once each, twelve months of it for an annual plan; its currency says EUR, as raw's do (Q-02-03).
CREATE TABLE ledgerloop_edge_clean.invoices AS SELECT * FROM ledgerloop_raw.invoices LIMIT 0;
INSERT INTO ledgerloop_edge_clean.invoices
WITH ev AS (SELECT DISTINCT subscription_id, event_type, event_date, mrr_delta_local FROM ledgerloop_edge_clean.subscription_events)
SELECT row_number() OVER (ORDER BY d.day, s.subscription_id), s.account_id, s.subscription_id, d.day,
       (CASE s.billing_period WHEN 'annual' THEN 12 ELSE 1 END) * (SELECT sum(e.mrr_delta_local) FROM ev e
                                                                   WHERE e.subscription_id = s.subscription_id AND e.event_date <= d.day),
       s.currency, 'paid'
FROM ledgerloop_edge_clean.subscriptions s, range(0, 72) AS k(n),
     LATERAL (SELECT CAST(s.start_date + to_months(CAST(k.n * CASE s.billing_period WHEN 'annual' THEN 12 ELSE 1 END AS INTEGER)) AS DATE) AS day) AS d
WHERE d.day BETWEEN DATE '2024-01-01' AND DATE '2025-12-31'
  AND (nullif(s.end_date, DATE '9999-12-31') IS NULL OR d.day < s.end_date);
-- One attempt per invoice on its day, between 04:00 and 07:00 Brussels time, held as the UTC instant (Q-02-04); subscription 1's
-- invoice of 2025-03-14 fails first and is paid by a retry three days later at 23:30 UTC.
CREATE TABLE ledgerloop_edge_clean.payments AS SELECT * FROM ledgerloop_raw.payments LIMIT 0;
INSERT INTO ledgerloop_edge_clean.payments
SELECT row_number() OVER (ORDER BY a.attempted_at, a.invoice_id, a.attempt_no), a.invoice_id, a.attempt_no, a.attempted_at, a.succeeded,
       a.failure_reason
FROM (SELECT i.invoice_id, 1 AS attempt_no,
             timezone('Europe/Brussels', i.invoice_date + INTERVAL 4 HOUR + to_minutes(CAST(i.invoice_id * 37 % 180 AS INTEGER))) AS attempted_at,
             NOT (i.subscription_id = 1 AND i.invoice_date = DATE '2025-03-14') AS succeeded,
             CASE WHEN i.subscription_id = 1 AND i.invoice_date = DATE '2025-03-14' THEN 'card_expired' END AS failure_reason
      FROM ledgerloop_edge_clean.invoices i
      UNION ALL
      SELECT i.invoice_id, 2, TIMESTAMPTZ '2025-03-17 23:30:00+00', true, NULL
      FROM ledgerloop_edge_clean.invoices i WHERE i.subscription_id = 1 AND i.invoice_date = DATE '2025-03-14') AS a;
CREATE TABLE ledgerloop_edge_clean.fx_rates AS SELECT * FROM ledgerloop_raw.fx_rates;
CREATE TABLE ledgerloop_edge_clean.users AS SELECT * FROM ledgerloop_raw.users LIMIT 0;
INSERT INTO ledgerloop_edge_clean.users VALUES
  (1, 1, 'admin', TIMESTAMP '2021-06-14 10:50:00', NULL),
  (2, 2, 'admin', TIMESTAMP '2022-09-05 10:00:00', NULL),
  (3, 3, 'admin', TIMESTAMP '2024-04-08 10:30:00', TIMESTAMP '2025-04-08 09:40:00'),
  (4, 4, 'admin', TIMESTAMP '2024-05-13 10:45:00', NULL),
  (5, 4, 'accountant', TIMESTAMP '2024-05-20 09:00:00', NULL),
  (6, 5, 'admin', TIMESTAMP '2024-09-02 14:10:00', NULL),
  (7, 6, 'admin', TIMESTAMP '2025-03-10 09:30:00', TIMESTAMP '2025-07-10 09:20:00');
-- A row for each account and week (Monday) it is a customer, the sentinel read as no end: its users active at noon that Monday (at
-- least one) and four reconciliations each; no account here uses AP Automation.
CREATE TABLE ledgerloop_edge_clean.usage_weekly AS SELECT * FROM ledgerloop_raw.usage_weekly LIMIT 0;
INSERT INTO ledgerloop_edge_clean.usage_weekly
SELECT a.account_id, w.week_start, CAST(u.active AS INTEGER), CAST(4 * u.active + a.account_id % 5 AS INTEGER), 0
FROM ledgerloop_edge_clean.accounts a,
     (SELECT CAST(range AS DATE) AS week_start FROM range(DATE '2024-01-01', DATE '2025-12-30', INTERVAL 7 DAY)) AS w,
     LATERAL (SELECT greatest(1, count(*)) AS active FROM ledgerloop_edge_clean.users x WHERE x.account_id = a.account_id
              AND x.invited_at <= w.week_start + INTERVAL 12 HOUR
              AND (x.deactivated_at IS NULL OR x.deactivated_at > w.week_start + INTERVAL 12 HOUR)) AS u
WHERE EXISTS (SELECT 1 FROM ledgerloop_edge_clean.subscriptions s WHERE s.account_id = a.account_id
              AND s.start_date <= w.week_start + 6 AND (nullif(s.end_date, DATE '9999-12-31') IS NULL OR s.end_date > w.week_start));
CREATE TABLE ledgerloop_edge_clean.support_tickets AS SELECT * FROM ledgerloop_raw.support_tickets LIMIT 0;
INSERT INTO ledgerloop_edge_clean.support_tickets VALUES
  (1, 3, TIMESTAMP '2025-03-20 10:00:00', 'billing', 'P1', TIMESTAMP '2025-03-20 15:30:00'),
  (2, 4, TIMESTAMP '2025-06-18 09:15:00', 'reconciliation', 'P3', TIMESTAMP '2025-06-19 11:00:00'),
  (3, 1, TIMESTAMP '2025-10-07 14:00:00', 'bank_feeds', 'P2', NULL);
CREATE TABLE ledgerloop_edge_clean.marketing_spend_monthly AS SELECT * FROM ledgerloop_raw.marketing_spend_monthly;
CREATE TABLE ledgerloop_edge_clean.leads AS SELECT * FROM ledgerloop_raw.leads LIMIT 0;
INSERT INTO ledgerloop_edge_clean.leads VALUES
  (1, TIMESTAMP '2024-03-11 09:00:00', 'events', 'Enterprise', 'cfo@lemanoptics.example'),
  (2, TIMESTAMP '2024-04-22 10:30:00', 'paid_search', 'SMB', 'office@noorderretail.example'),
  (3, TIMESTAMP '2024-08-05 11:00:00', 'partner', 'Mid-Market', 'finance@isarbouw.example'),
  (4, TIMESTAMP '2025-02-17 13:00:00', 'paid_social', 'SMB', 'admin@seinemedia.example'),
  (5, TIMESTAMP '2025-05-12 09:45:00', 'organic', 'SMB', 'info@duinenstudio.example');
CREATE TABLE ledgerloop_edge_clean.opportunities AS SELECT * FROM ledgerloop_raw.opportunities LIMIT 0;
INSERT INTO ledgerloop_edge_clean.opportunities VALUES
  (1, 1, 3, TIMESTAMP '2024-03-13 10:00:00', 'contract', TIMESTAMP '2024-04-08 09:30:00', true, 27600.00),
  (2, 2, 4, TIMESTAMP '2024-04-24 09:00:00', 'contract', TIMESTAMP '2024-05-13 10:00:00', true, 10680.00),
  (3, 3, 5, TIMESTAMP '2024-08-07 10:00:00', 'contract', TIMESTAMP '2024-09-02 13:00:00', true, 9078.00),
  (4, 4, 6, TIMESTAMP '2025-02-19 10:00:00', 'contract', TIMESTAMP '2025-03-10 08:30:00', true, 4188.00),
  (5, 5, NULL, TIMESTAMP '2025-05-14 10:00:00', 'demo', TIMESTAMP '2025-06-02 16:00:00', false, 3500.00);
CREATE TABLE ledgerloop_edge_clean.cogs_monthly AS SELECT * FROM ledgerloop_raw.cogs_monthly;
CREATE TABLE ledgerloop_edge_clean.sm_expense_monthly AS SELECT * FROM ledgerloop_raw.sm_expense_monthly;
CREATE TABLE ledgerloop_edge_clean.app_events AS SELECT * FROM ledgerloop_raw.app_events LIMIT 0;
INSERT INTO ledgerloop_edge_clean.app_events VALUES
  (1, 4, 4, TIMESTAMPTZ '2025-10-14 08:00:00+00', 'login'),
  (2, 4, 4, TIMESTAMPTZ '2025-10-14 08:12:00+00', 'upload_statement'),
  (3, 5, 4, TIMESTAMPTZ '2025-11-05 09:30:00+00', 'match_transaction');

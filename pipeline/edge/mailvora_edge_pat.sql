-- pipeline/edge/mailvora_edge_pat.sql (family: SQL-PAT-01 to SQL-PAT-08; ERR-LOG-39, -40, -44, -45, -46, -50, -34, -37 and the rest of E-209)
-- Sprint 8 (S8-07): the level 6 business-pattern cases on Mailvora's eleven tables, January 2024 to December 2025. Planted
-- (pipeline/tests/test_edge_pat.py holds each):
--   a tie at each top-N cutoff a prompt can name, over 2025 (1 January to 31 December): campaigns by spend and by clicks within
--   channel, highest first: nonbrand search (1) and Meta (3) each have two campaigns tied for first and two tied for third; brand
--   search (2) and review sites (6) each have two tied for second;
--   two rows of one key at the same time: visitors V9200002 and V9200003 each have two first sessions at the same moment, from two
--   channels, and user 2's two latest activation events share a moment;
--   a missing month, week and day: no ad spend in June 2024, in any channel, while budget_monthly holds June 2024 for every paid
--   channel (so LAG 12 over the months with spend is not the month a year before for January to June 2025); nonbrand search spends
--   in every month but June 2024; no spend in the week of 10 March 2025; campaign 1 spends on 3, 4, 5, 7, 8 and 9 March 2025 but not the 6th;
--   cohorts whose later months fall after the as-of date (2026-01-05): users 11 and 12 signed up in November and December 2025 and
--   pay. User 4 signs up on 31 January 2025 and first pays on 1 March: two calendar months, 29 days (ERR-LOG-46), and another cohort
--   month by first payment (ERR-LOG-50). Three subscriptions end, so their cohorts' later months hold 0, not missing;
--   funnel steps without the one before: user 6 pays and is never activated (no first_campaign_sent); user 7 pays two weeks before
--   being activated; user 8 is activated and never pays;
--   an event pair across the clock change and one exactly 30 minutes apart: user 10 (NL) has activation events at 00:45 and 01:20
--   UTC on 2025-10-26, 35 minutes apart, which read 02:45 and then 02:20 on Amsterdam's wall clock; and two events exactly 30:00
--   apart on 2025-10-14. User 9 has another exact 30:00 pair on 2025-10-26, inside EX-SQL-PAT-08-E1-22's day (F2-1-2);
--   a short session across UTC midnight into each window start SQL-PAT-08's whole-history prompts name (F2-1-1), on users 1 and 9,
--   outside every other plant: 23:50 and 00:10 UTC into 1 January 2025 (user 1), into 1 October 2025 (user 9, who starts a second
--   session at 09:00 that day) and into 13 October 2025 (user 1).
-- Beside them: campaign 1's daily click-through rates vary within its run; one refunded payment. Spend is in euros and UTC (as in
-- mailvora); every campaign session falls on a day its campaign had clicks; each signup follows a session of its visitor; each
-- activated user's first event is first_campaign_sent; payments fall each month on the subscription's start day, at 03:00 UTC, at
-- the plan's price, while the subscription runs (the build's own SQL below makes them from the subscriptions).
CREATE SCHEMA mailvora_edge_pat;
CREATE TABLE mailvora_edge_pat.channels AS SELECT * FROM mailvora.channels;
CREATE TABLE mailvora_edge_pat.countries AS SELECT * FROM mailvora.countries;
CREATE TABLE mailvora_edge_pat.fx_rates_monthly AS SELECT * FROM mailvora.fx_rates_monthly;
CREATE TABLE mailvora_edge_pat.campaigns AS SELECT * FROM mailvora.campaigns LIMIT 0;
INSERT INTO mailvora_edge_pat.campaigns VALUES
  (1, 1, 'Search | email marketing software | 2025', 'nb_email_marketing_software_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (2, 1, 'Search | newsletter tool | 2025', 'nb_newsletter_tool_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (3, 1, 'Search | email automation | 2025', 'nb_email_automation_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (4, 1, 'Search | email templates | 2025', 'nb_email_templates_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (5, 2, 'Brand | mailvora | 2025', 'brand_mailvora_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (6, 2, 'Brand | mailvora login | 2025', 'brand_mailvora_login_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (7, 2, 'Brand | mailvora pricing | 2025', 'brand_mailvora_pricing_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (8, 3, 'Meta | prospecting | coaches | 2025', 'meta_prospecting_coaches_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (9, 3, 'Meta | prospecting | shop owners | 2025', 'meta_prospecting_shop_owners_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (10, 3, 'Meta | retargeting | shop owners | 2025', 'meta_retargeting_shop_owners_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (11, 3, 'Meta | prospecting | lookalike signups | 2025', 'meta_prospecting_lookalike_signups_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (12, 6, 'Capterra | email marketing | 2025', 'rv_capterra_email_marketing_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (13, 6, 'G2 | email marketing | 2025', 'rv_g2_email_marketing_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (14, 6, 'Capterra | newsletter software | 2025', 'rv_capterra_newsletter_software_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (15, 4, 'LinkedIn | marketing managers | 2025', 'li_marketing_managers_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (16, 5, 'YouTube | flight 14 | tutorial', 'yt_f14_tutorial', DATE '2025-11-17', DATE '2025-11-30'),
  (17, 1, 'Search | email for shops | 2025', 'nb_email_for_shops_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (18, 1, 'Search | email marketing software | 2024', 'nb_email_marketing_software_2024', DATE '2024-01-01', DATE '2024-12-31'),
  (19, 2, 'Brand | mailvora | 2024', 'brand_mailvora_2024', DATE '2024-01-01', DATE '2024-12-31'),
  (20, 3, 'Meta | prospecting | coaches | 2024', 'meta_prospecting_coaches_2024', DATE '2024-01-01', DATE '2024-12-31');
CREATE TABLE mailvora_edge_pat.ad_spend_daily AS SELECT * FROM mailvora.ad_spend_daily LIMIT 0;
INSERT INTO mailvora_edge_pat.ad_spend_daily VALUES
  (DATE '2024-01-15', 18, 2000, 20, 40.00, 'EUR', 'UTC'),
  (DATE '2024-02-12', 18, 2100, 21, 42.00, 'EUR', 'UTC'),
  (DATE '2024-03-04', 19, 4000, 200, 100.00, 'EUR', 'UTC'),
  (DATE '2024-03-11', 18, 2200, 22, 44.00, 'EUR', 'UTC'),
  (DATE '2024-04-15', 18, 2300, 23, 46.00, 'EUR', 'UTC'),
  (DATE '2024-04-22', 20, 40000, 200, 300.00, 'EUR', 'UTC'),
  (DATE '2024-05-13', 18, 2400, 24, 48.00, 'EUR', 'UTC'),
  (DATE '2024-07-15', 18, 2500, 25, 50.00, 'EUR', 'UTC'),
  (DATE '2024-08-12', 18, 2600, 26, 52.00, 'EUR', 'UTC'),
  (DATE '2024-09-16', 18, 2700, 27, 54.00, 'EUR', 'UTC'),
  (DATE '2024-10-07', 19, 4000, 200, 100.00, 'EUR', 'UTC'),
  (DATE '2024-10-14', 18, 2800, 28, 56.00, 'EUR', 'UTC'),
  (DATE '2024-11-11', 18, 2900, 29, 58.00, 'EUR', 'UTC'),
  (DATE '2024-11-18', 20, 40000, 200, 300.00, 'EUR', 'UTC'),
  (DATE '2024-12-09', 18, 3000, 30, 60.00, 'EUR', 'UTC'),
  (DATE '2025-01-06', 5, 4000, 500, 250.00, 'EUR', 'UTC'),
  (DATE '2025-01-13', 2, 2500, 50, 100.00, 'EUR', 'UTC'),
  (DATE '2025-01-20', 8, 60000, 300, 450.00, 'EUR', 'UTC'),
  (DATE '2025-02-03', 12, 300, 20, 60.00, 'EUR', 'UTC'),
  (DATE '2025-02-10', 3, 1500, 40, 75.00, 'EUR', 'UTC'),
  (DATE '2025-02-17', 10, 52000, 300, 450.00, 'EUR', 'UTC'),
  (DATE '2025-03-03', 1, 1000, 25, 50.00, 'EUR', 'UTC'),
  (DATE '2025-03-04', 1, 2500, 25, 50.00, 'EUR', 'UTC'),
  (DATE '2025-03-05', 1, 1400, 25, 50.00, 'EUR', 'UTC'),
  (DATE '2025-03-07', 1, 1500, 25, 50.00, 'EUR', 'UTC'),
  (DATE '2025-03-08', 1, 4000, 25, 50.00, 'EUR', 'UTC'),
  (DATE '2025-03-09', 1, 1500, 25, 50.00, 'EUR', 'UTC'),
  (DATE '2025-03-17', 9, 40000, 200, 300.00, 'EUR', 'UTC'),
  (DATE '2025-04-07', 6, 2000, 250, 125.00, 'EUR', 'UTC'),
  (DATE '2025-04-14', 4, 1000, 25, 50.00, 'EUR', 'UTC'),
  (DATE '2025-05-05', 13, 350, 25, 80.00, 'EUR', 'UTC'),
  (DATE '2025-05-12', 2, 2600, 50, 100.00, 'EUR', 'UTC'),
  (DATE '2025-06-02', 12, 280, 20, 80.00, 'EUR', 'UTC'),
  (DATE '2025-06-09', 17, 500, 10, 20.00, 'EUR', 'UTC'),
  (DATE '2025-06-16', 8, 55000, 300, 450.00, 'EUR', 'UTC'),
  (DATE '2025-07-07', 5, 4200, 500, 250.00, 'EUR', 'UTC'),
  (DATE '2025-07-14', 4, 1100, 25, 50.00, 'EUR', 'UTC'),
  (DATE '2025-07-21', 9, 38000, 200, 300.00, 'EUR', 'UTC'),
  (DATE '2025-08-11', 3, 1400, 35, 75.00, 'EUR', 'UTC'),
  (DATE '2025-08-18', 11, 25000, 150, 225.00, 'EUR', 'UTC'),
  (DATE '2025-08-25', 15, 9000, 30, 210.00, 'EUR', 'UTC'),
  (DATE '2025-09-08', 17, 500, 10, 20.00, 'EUR', 'UTC'),
  (DATE '2025-09-15', 7, 3800, 500, 250.00, 'EUR', 'UTC'),
  (DATE '2025-10-06', 6, 2100, 250, 125.00, 'EUR', 'UTC'),
  (DATE '2025-10-13', 4, 1200, 25, 50.00, 'EUR', 'UTC'),
  (DATE '2025-10-20', 9, 41000, 200, 300.00, 'EUR', 'UTC'),
  (DATE '2025-11-10', 2, 2700, 50, 100.00, 'EUR', 'UTC'),
  (DATE '2025-11-17', 11, 25000, 150, 225.00, 'EUR', 'UTC'),
  (DATE '2025-11-24', 16, 90000, 200, 600.00, 'EUR', 'UTC'),
  (DATE '2025-12-01', 14, 330, 25, 80.00, 'EUR', 'UTC'),
  (DATE '2025-12-08', 17, 500, 10, 20.00, 'EUR', 'UTC');
-- Every paid channel's budget for every month of 2024 and 2025: a month spine that holds June 2024.
CREATE TABLE mailvora_edge_pat.budget_monthly AS SELECT * FROM mailvora.budget_monthly LIMIT 0;
INSERT INTO mailvora_edge_pat.budget_monthly
SELECT CAST(m.range AS DATE), b.channel_id, b.budget_eur
FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH) AS m
CROSS JOIN (VALUES (1, 800.00), (2, 600.00), (3, 1200.00), (4, 250.00), (5, 700.00), (6, 150.00), (7, 500.00)) AS b(channel_id, budget_eur);
CREATE TABLE mailvora_edge_pat.sessions AS SELECT * FROM mailvora.sessions LIMIT 0;
INSERT INTO mailvora_edge_pat.sessions VALUES
  (1, 'V9200001', TIMESTAMPTZ '2024-02-12 10:00:00+00', 'google', 'cpc', 'nb_email_marketing_software_2024', '/pricing', 'desktop', 'NL'),
  (2, 'V9200019', TIMESTAMPTZ '2024-07-08 13:30:00+00', 'google', 'organic', NULL, '/blog/email-subject-lines', 'mobile', 'DE'),
  (3, 'V9200021', TIMESTAMPTZ '2024-10-14 08:30:00+00', 'google', 'cpc', 'nb_email_marketing_software_2024', '/', 'desktop', 'FR'),
  (4, 'V9200004', TIMESTAMPTZ '2025-01-20 18:00:00+00', 'facebook', 'paid_social', 'meta_prospecting_coaches_2025', '/lp/free-newsletter', 'mobile', 'DE'),
  (5, 'V9200012', TIMESTAMPTZ '2025-01-31 15:30:00+00', NULL, NULL, NULL, '/', 'desktop', 'BE'),
  (6, 'V9200002', TIMESTAMPTZ '2025-03-17 18:00:00+00', 'facebook', 'paid_social', 'meta_prospecting_shop_owners_2025', '/lp/grow-your-list', 'mobile', 'DE'),
  (7, 'V9200002', TIMESTAMPTZ '2025-03-17 18:00:00+00', 'google', 'organic', NULL, '/blog/email-subject-lines', 'mobile', 'DE'),
  (8, 'V9200013', TIMESTAMPTZ '2025-04-14 09:00:00+00', 'google', 'cpc', 'nb_email_templates_2025', '/features', 'desktop', 'ES'),
  (9, 'V9200014', TIMESTAMPTZ '2025-05-05 10:40:00+00', 'g2', 'cpc', 'rv_g2_email_marketing_2025', '/', 'desktop', 'IE'),
  (10, 'V9200015', TIMESTAMPTZ '2025-06-02 11:30:00+00', 'capterra', 'cpc', 'rv_capterra_email_marketing_2025', '/', 'desktop', 'PL'),
  (11, 'V9200001', TIMESTAMPTZ '2025-06-09 08:00:00+00', 'google', 'cpc', 'nb_email_for_shops_2025', '/pricing', 'desktop', 'NL'),
  (12, 'V9200003', TIMESTAMPTZ '2025-07-07 12:00:00+00', 'google', 'cpc', 'brand_mailvora_2025', '/', 'desktop', 'FR'),
  (13, 'V9200003', TIMESTAMPTZ '2025-07-07 12:00:00+00', 'google', 'organic', NULL, '/features/automation', 'desktop', 'FR'),
  (14, 'V9200003', TIMESTAMPTZ '2025-07-08 09:00:00+00', NULL, NULL, NULL, '/', 'desktop', 'FR'),
  (15, 'V9200005', TIMESTAMPTZ '2025-08-25 09:00:00+00', 'linkedin', 'paid_social', 'li_marketing_managers_2025', '/lp/b2b-email', 'desktop', 'DK'),
  (16, 'V9200018', TIMESTAMPTZ '2025-09-15 09:30:00+00', 'google', 'cpc', 'brand_mailvora_pricing_2025', '/pricing', 'mobile', 'NL'),
  (17, 'V9200016', TIMESTAMPTZ '2025-11-17 12:30:00+00', 'facebook', 'paid_social', 'meta_prospecting_lookalike_signups_2025', '/', 'mobile', 'SE'),
  (18, 'V9200017', TIMESTAMPTZ '2025-12-08 09:00:00+00', 'google', 'cpc', 'nb_email_for_shops_2025', '/pricing', 'desktop', 'AT');
CREATE TABLE mailvora_edge_pat.signups AS SELECT * FROM mailvora.signups LIMIT 0;
INSERT INTO mailvora_edge_pat.signups VALUES
  (1, 'V9200001', TIMESTAMPTZ '2024-02-12 10:30:00+00', 'NL', 'bakkerijdekroon.nl'),
  (2, 'V9200019', TIMESTAMPTZ '2024-07-08 14:00:00+00', 'DE', 'gmx.de'),
  (3, 'V9200021', TIMESTAMPTZ '2024-10-14 09:00:00+00', 'FR', 'orange.fr'),
  (4, 'V9200012', TIMESTAMPTZ '2025-01-31 16:00:00+00', 'BE', 'atelierroos.be'),
  (5, 'V9200002', TIMESTAMPTZ '2025-03-17 18:20:00+00', 'DE', 'web.de'),
  (6, 'V9200013', TIMESTAMPTZ '2025-04-14 09:20:00+00', 'ES', 'gmail.com'),
  (7, 'V9200014', TIMESTAMPTZ '2025-05-05 11:00:00+00', 'IE', 'brightcafe.ie'),
  (8, 'V9200015', TIMESTAMPTZ '2025-06-02 12:00:00+00', 'PL', 'wp.pl'),
  (9, 'V9200005', TIMESTAMPTZ '2025-08-25 09:20:00+00', 'DK', 'designhuset.dk'),
  (10, 'V9200018', TIMESTAMPTZ '2025-09-15 10:00:00+00', 'NL', 'fietsmaker.nl'),
  (11, 'V9200016', TIMESTAMPTZ '2025-11-17 13:00:00+00', 'SE', 'kafferosteriet.se'),
  (12, 'V9200017', TIMESTAMPTZ '2025-12-08 09:30:00+00', 'AT', 'gasthausalpen.at');
CREATE TABLE mailvora_edge_pat.activation_events AS SELECT * FROM mailvora.activation_events LIMIT 0;
INSERT INTO mailvora_edge_pat.activation_events VALUES
  (1, TIMESTAMPTZ '2024-02-13 09:00:00+00', 'first_campaign_sent'),
  (1, TIMESTAMPTZ '2024-03-05 09:00:00+00', 'campaign_sent'),
  (1, TIMESTAMPTZ '2024-05-21 10:00:00+00', 'list_imported'),
  (1, TIMESTAMPTZ '2024-12-31 23:50:00+00', 'campaign_sent'),
  (1, TIMESTAMPTZ '2025-01-01 00:10:00+00', 'list_imported'),
  (1, TIMESTAMPTZ '2025-10-12 23:50:00+00', 'campaign_sent'),
  (1, TIMESTAMPTZ '2025-10-13 00:10:00+00', 'automation_created'),
  (2, TIMESTAMPTZ '2024-07-09 10:00:00+00', 'first_campaign_sent'),
  (2, TIMESTAMPTZ '2024-08-05 09:00:00+00', 'campaign_sent'),
  (2, TIMESTAMPTZ '2025-02-10 11:00:00+00', 'campaign_sent'),
  (2, TIMESTAMPTZ '2025-02-10 11:00:00+00', 'automation_created'),
  (3, TIMESTAMPTZ '2024-10-15 12:00:00+00', 'first_campaign_sent'),
  (4, TIMESTAMPTZ '2025-02-20 10:00:00+00', 'first_campaign_sent'),
  (5, TIMESTAMPTZ '2025-03-18 08:30:00+00', 'first_campaign_sent'),
  (7, TIMESTAMPTZ '2025-05-20 10:00:00+00', 'first_campaign_sent'),
  (8, TIMESTAMPTZ '2025-06-03 15:00:00+00', 'first_campaign_sent'),
  (9, TIMESTAMPTZ '2025-08-26 10:00:00+00', 'first_campaign_sent'),
  (9, TIMESTAMPTZ '2025-09-30 23:50:00+00', 'campaign_sent'),
  (9, TIMESTAMPTZ '2025-10-01 00:10:00+00', 'form_published'),
  (9, TIMESTAMPTZ '2025-10-01 09:00:00+00', 'automation_created'),
  (9, TIMESTAMPTZ '2025-10-26 09:00:00+00', 'campaign_sent'),
  (9, TIMESTAMPTZ '2025-10-26 09:30:00+00', 'list_imported'),
  (10, TIMESTAMPTZ '2025-09-16 08:00:00+00', 'first_campaign_sent'),
  (10, TIMESTAMPTZ '2025-10-14 09:00:00+00', 'campaign_sent'),
  (10, TIMESTAMPTZ '2025-10-14 09:30:00+00', 'automation_created'),
  (10, TIMESTAMPTZ '2025-10-26 00:45:00+00', 'campaign_sent'),
  (10, TIMESTAMPTZ '2025-10-26 01:20:00+00', 'form_published'),
  (10, TIMESTAMPTZ '2025-11-03 08:00:00+00', 'campaign_sent'),
  (11, TIMESTAMPTZ '2025-11-18 10:00:00+00', 'first_campaign_sent'),
  (12, TIMESTAMPTZ '2025-12-09 11:00:00+00', 'first_campaign_sent');
CREATE TABLE mailvora_edge_pat.subscriptions AS SELECT * FROM mailvora.subscriptions LIMIT 0;
INSERT INTO mailvora_edge_pat.subscriptions VALUES
  (1, 1, 'Pro', DATE '2024-02-14', NULL, 45.00),
  (2, 2, 'Business', DATE '2024-07-10', NULL, 120.00),
  (3, 3, 'Lite', DATE '2024-10-16', DATE '2025-04-15', 15.00),
  (4, 4, 'Lite', DATE '2025-03-01', NULL, 15.00),
  (5, 5, 'Pro', DATE '2025-03-19', DATE '2025-06-18', 45.00),
  (6, 6, 'Pro', DATE '2025-04-16', DATE '2025-07-15', 45.00),
  (7, 7, 'Business', DATE '2025-05-06', NULL, 120.00),
  (8, 9, 'Lite', DATE '2025-08-27', NULL, 15.00),
  (9, 10, 'Pro', DATE '2025-09-17', NULL, 45.00),
  (10, 11, 'Pro', DATE '2025-11-19', NULL, 45.00),
  (11, 12, 'Lite', DATE '2025-12-10', NULL, 15.00);
-- One payment a month on the subscription's start day (the month's last day when it has no such day), at 03:00 UTC, at the plan's
-- price, from the start while the subscription runs (end_date is its last day), up to 2025-12-31. Subscription 5's May payment is
-- refunded.
CREATE TABLE mailvora_edge_pat.payments AS SELECT * FROM mailvora.payments LIMIT 0;
INSERT INTO mailvora_edge_pat.payments
SELECT row_number() OVER (ORDER BY p.paid_at, p.subscription_id), p.subscription_id, p.paid_at, p.monthly_price_eur,
       p.subscription_id = 5 AND p.day = DATE '2025-05-19'
FROM (SELECT s.subscription_id, s.monthly_price_eur, d.day, timezone('UTC', d.day + INTERVAL 3 HOUR) AS paid_at
      FROM mailvora_edge_pat.subscriptions s, range(0, 24) AS k(n),
           LATERAL (SELECT CAST(s.start_date + to_months(CAST(k.n AS INTEGER)) AS DATE) AS day) AS d
      WHERE d.day <= coalesce(s.end_date, DATE '2025-12-31')) AS p;

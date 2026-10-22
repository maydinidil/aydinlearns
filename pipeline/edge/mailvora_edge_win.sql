-- pipeline/edge/mailvora_edge_win.sql (family: SQL-WIN-01 to SQL-WIN-07; ERR-LOG-37 to ERR-LOG-43, ERR-SYN-08, ERR-LOG-20)
-- Sprint 7 (S7-25, S7-22): the level 5 window cases on Mailvora's eleven tables, July to October 2025. Planted
-- (pipeline/tests/test_edge_win.py holds each):
--   ties at rank cutoffs in two partitions, by spend and by clicks (July to October 2025) within channel: nonbrand search (1) and
--   Meta (3) each have two campaigns tied for first place and two tied for third (highest first); brand search (2) and review sites
--   (6) each have two tied for second. Visitors V9100002 and V9100003 each have two first sessions at the same moment, from two
--   channels;
--   partitions with one row: LinkedIn (4) has one campaign, which spent on one day; visitors with one session;
--   a missing value in a window ORDER BY column: an active plan has no end date; user 1 moved from Lite (ended) to Pro (active);
--   a month with no rows between two months with rows: no ad spend in September 2025, between August and October, in every channel
--   that spent in July, August and October, while budget_monthly holds September for every channel; subscription 3 is paid in
--   August and October and not in September;
--   two rows with the same ORDER BY date: two or three campaigns of one channel spent on the same day (nonbrand search, brand search
--   and Meta), and users 6 and 7 signed up on the same day;
--   a group of 3 rows under NTILE(5): YouTube (5) has three campaigns, and subscription 4 has three payments.
-- Beside them: campaign 1 spent on ten days in July 2025 with 6 July missing, and its daily click-through rates vary, so a 7-row
-- window is not 7 days and the average of daily rates is not the rate of the sums; a refunded payment. Spend is in euros and UTC
-- (as in mailvora); every campaign session falls on a day its campaign had clicks; payments fall inside their subscription.
CREATE SCHEMA mailvora_edge_win;
CREATE TABLE mailvora_edge_win.channels AS SELECT * FROM mailvora.channels;
CREATE TABLE mailvora_edge_win.countries AS SELECT * FROM mailvora.countries;
CREATE TABLE mailvora_edge_win.fx_rates_monthly AS SELECT * FROM mailvora.fx_rates_monthly
WHERE month BETWEEN DATE '2025-07-01' AND DATE '2025-10-01';
CREATE TABLE mailvora_edge_win.campaigns AS SELECT * FROM mailvora.campaigns LIMIT 0;
INSERT INTO mailvora_edge_win.campaigns VALUES
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
  (16, 5, 'YouTube | flight 11 | tutorial', 'yt_f11_tutorial', DATE '2025-07-21', DATE '2025-08-03'),
  (17, 5, 'YouTube | flight 12 | tutorial', 'yt_f12_tutorial', DATE '2025-08-18', DATE '2025-08-31'),
  (18, 5, 'YouTube | flight 13 | tutorial', 'yt_f13_tutorial', DATE '2025-10-20', DATE '2025-11-02');
CREATE TABLE mailvora_edge_win.ad_spend_daily AS SELECT * FROM mailvora.ad_spend_daily LIMIT 0;
INSERT INTO mailvora_edge_win.ad_spend_daily VALUES
  (DATE '2025-07-01', 1, 1000, 20, 40.00, 'EUR', 'UTC'),
  (DATE '2025-07-02', 1, 2500, 25, 50.00, 'EUR', 'UTC'),
  (DATE '2025-07-03', 1, 1400, 35, 70.00, 'EUR', 'UTC'),
  (DATE '2025-07-04', 1, 1500, 30, 60.00, 'EUR', 'UTC'),
  (DATE '2025-07-05', 1, 4000, 40, 80.00, 'EUR', 'UTC'),
  (DATE '2025-07-07', 1, 1500, 15, 30.00, 'EUR', 'UTC'),
  (DATE '2025-07-08', 1, 1800, 45, 90.00, 'EUR', 'UTC'),
  (DATE '2025-07-09', 1, 2500, 25, 50.00, 'EUR', 'UTC'),
  (DATE '2025-07-10', 1, 700, 35, 70.00, 'EUR', 'UTC'),
  (DATE '2025-07-11', 1, 1200, 30, 60.00, 'EUR', 'UTC'),
  (DATE '2025-08-04', 2, 6000, 150, 300.00, 'EUR', 'UTC'),
  (DATE '2025-10-06', 2, 5000, 150, 300.00, 'EUR', 'UTC'),
  (DATE '2025-07-14', 3, 3000, 75, 150.00, 'EUR', 'UTC'),
  (DATE '2025-10-06', 3, 2500, 75, 150.00, 'EUR', 'UTC'),
  (DATE '2025-08-04', 4, 2000, 75, 150.00, 'EUR', 'UTC'),
  (DATE '2025-10-13', 4, 3500, 75, 150.00, 'EUR', 'UTC'),
  (DATE '2025-07-14', 5, 4000, 500, 250.00, 'EUR', 'UTC'),
  (DATE '2025-08-11', 5, 4200, 500, 250.00, 'EUR', 'UTC'),
  (DATE '2025-07-14', 6, 2000, 250, 125.00, 'EUR', 'UTC'),
  (DATE '2025-10-13', 6, 2100, 250, 125.00, 'EUR', 'UTC'),
  (DATE '2025-08-11', 7, 3800, 500, 250.00, 'EUR', 'UTC'),
  (DATE '2025-07-21', 8, 60000, 300, 450.00, 'EUR', 'UTC'),
  (DATE '2025-08-18', 8, 55000, 300, 450.00, 'EUR', 'UTC'),
  (DATE '2025-07-21', 9, 40000, 200, 300.00, 'EUR', 'UTC'),
  (DATE '2025-08-18', 9, 38000, 200, 300.00, 'EUR', 'UTC'),
  (DATE '2025-10-20', 9, 41000, 200, 300.00, 'EUR', 'UTC'),
  (DATE '2025-08-18', 10, 52000, 300, 450.00, 'EUR', 'UTC'),
  (DATE '2025-10-20', 11, 50000, 300, 450.00, 'EUR', 'UTC'),
  (DATE '2025-07-07', 12, 300, 20, 60.00, 'EUR', 'UTC'),
  (DATE '2025-10-06', 12, 280, 20, 60.00, 'EUR', 'UTC'),
  (DATE '2025-08-04', 13, 350, 25, 80.00, 'EUR', 'UTC'),
  (DATE '2025-10-13', 14, 330, 25, 80.00, 'EUR', 'UTC'),
  (DATE '2025-08-25', 15, 9000, 30, 210.00, 'EUR', 'UTC'),
  (DATE '2025-07-28', 16, 150000, 400, 1200.00, 'EUR', 'UTC'),
  (DATE '2025-08-25', 17, 120000, 300, 900.00, 'EUR', 'UTC'),
  (DATE '2025-10-27', 18, 90000, 200, 600.00, 'EUR', 'UTC');
CREATE TABLE mailvora_edge_win.budget_monthly AS SELECT * FROM mailvora.budget_monthly LIMIT 0;
INSERT INTO mailvora_edge_win.budget_monthly VALUES
  (DATE '2025-07-01', 1, 800.00), (DATE '2025-08-01', 1, 800.00), (DATE '2025-09-01', 1, 800.00), (DATE '2025-10-01', 1, 800.00),
  (DATE '2025-07-01', 2, 600.00), (DATE '2025-08-01', 2, 600.00), (DATE '2025-09-01', 2, 600.00), (DATE '2025-10-01', 2, 600.00),
  (DATE '2025-07-01', 3, 1200.00), (DATE '2025-08-01', 3, 1200.00), (DATE '2025-09-01', 3, 1200.00), (DATE '2025-10-01', 3, 1200.00),
  (DATE '2025-07-01', 4, 250.00), (DATE '2025-08-01', 4, 250.00), (DATE '2025-09-01', 4, 250.00), (DATE '2025-10-01', 4, 250.00),
  (DATE '2025-07-01', 5, 1500.00), (DATE '2025-08-01', 5, 1000.00), (DATE '2025-09-01', 5, 0.00), (DATE '2025-10-01', 5, 700.00),
  (DATE '2025-07-01', 6, 150.00), (DATE '2025-08-01', 6, 150.00), (DATE '2025-09-01', 6, 150.00), (DATE '2025-10-01', 6, 150.00);
CREATE TABLE mailvora_edge_win.sessions AS SELECT * FROM mailvora.sessions LIMIT 0;
INSERT INTO mailvora_edge_win.sessions VALUES
  (1, 'V9100001', TIMESTAMPTZ '2025-07-01 09:00:00+00', 'google', 'cpc', 'nb_email_marketing_software_2025', '/pricing', 'desktop', 'NL'),
  (2, 'V9100001', TIMESTAMPTZ '2025-07-14 10:00:00+00', 'google', 'cpc', 'brand_mailvora_2025', '/', 'desktop', 'NL'),
  (3, 'V9100002', TIMESTAMPTZ '2025-07-21 18:00:00+00', 'facebook', 'paid_social', 'meta_prospecting_coaches_2025', '/lp/free-newsletter', 'mobile', 'DE'),
  (4, 'V9100002', TIMESTAMPTZ '2025-07-21 18:00:00+00', 'google', 'organic', NULL, '/blog/newsletter-ideas', 'mobile', 'DE'),
  (5, 'V9100003', TIMESTAMPTZ '2025-07-28 12:00:00+00', 'youtube', 'video', 'yt_f11_tutorial', '/tutorials', 'desktop', 'FR'),
  (6, 'V9100003', TIMESTAMPTZ '2025-07-28 12:00:00+00', 'google', 'organic', NULL, '/templates', 'desktop', 'FR'),
  (7, 'V9100003', TIMESTAMPTZ '2025-07-29 09:00:00+00', NULL, NULL, NULL, '/', 'desktop', 'FR'),
  (8, 'V9100004', TIMESTAMPTZ '2025-08-04 10:30:00+00', 'google', 'cpc', 'nb_newsletter_tool_2025', '/pricing', 'desktop', 'BE'),
  (9, 'V9100005', TIMESTAMPTZ '2025-08-11 13:00:00+00', 'google', 'cpc', 'brand_mailvora_pricing_2025', '/pricing', 'mobile', 'ES'),
  (10, 'V9100005', TIMESTAMPTZ '2025-08-18 20:00:00+00', 'facebook', 'paid_social', 'meta_retargeting_shop_owners_2025', '/lp/grow-your-list', 'mobile', 'ES'),
  (11, 'V9100005', TIMESTAMPTZ '2025-08-19 14:00:00+00', NULL, NULL, NULL, '/', 'desktop', 'ES'),
  (12, 'V9100006', TIMESTAMPTZ '2025-10-06 08:00:00+00', 'capterra', 'cpc', 'rv_capterra_email_marketing_2025', '/', 'desktop', 'IE'),
  (13, 'V9100007', TIMESTAMPTZ '2025-10-06 12:00:00+00', 'google', 'cpc', 'nb_email_automation_2025', '/pricing', 'tablet', 'NL'),
  (14, 'V9100008', TIMESTAMPTZ '2025-08-25 09:00:00+00', 'linkedin', 'paid_social', 'li_marketing_managers_2025', '/lp/teams', 'desktop', 'DK'),
  (15, 'V9100009', TIMESTAMPTZ '2025-10-20 17:00:00+00', 'facebook', 'paid_social', 'meta_prospecting_lookalike_signups_2025', '/', 'mobile', 'PL');
CREATE TABLE mailvora_edge_win.signups AS SELECT * FROM mailvora.signups LIMIT 0;
INSERT INTO mailvora_edge_win.signups VALUES
  (1, 'V9100001', TIMESTAMPTZ '2025-07-14 10:30:00+00', 'NL', 'bakkerijdekroon.nl'),
  (2, 'V9100002', TIMESTAMPTZ '2025-07-21 18:20:00+00', 'DE', 'gmx.de'),
  (3, 'V9100003', TIMESTAMPTZ '2025-07-29 09:10:00+00', 'FR', 'orange.fr'),
  (4, 'V9100004', TIMESTAMPTZ '2025-08-04 10:45:00+00', 'BE', 'atelierroos.be'),
  (5, 'V9100005', TIMESTAMPTZ '2025-08-19 14:10:00+00', 'ES', 'gmail.com'),
  (6, 'V9100006', TIMESTAMPTZ '2025-10-06 08:30:00+00', 'IE', 'brightcafe.ie'),
  (7, 'V9100007', TIMESTAMPTZ '2025-10-06 12:15:00+00', 'NL', 'fietsmaker.nl');
CREATE TABLE mailvora_edge_win.activation_events AS SELECT * FROM mailvora.activation_events LIMIT 0;
INSERT INTO mailvora_edge_win.activation_events VALUES
  (1, TIMESTAMPTZ '2025-07-15 09:00:00+00', 'first_campaign_sent'),
  (1, TIMESTAMPTZ '2025-07-22 09:00:00+00', 'campaign_sent'),
  (2, TIMESTAMPTZ '2025-07-22 10:00:00+00', 'list_imported'),
  (2, TIMESTAMPTZ '2025-07-23 08:00:00+00', 'first_campaign_sent'),
  (3, TIMESTAMPTZ '2025-07-30 16:00:00+00', 'first_campaign_sent'),
  (4, TIMESTAMPTZ '2025-08-05 09:00:00+00', 'first_campaign_sent'),
  (5, TIMESTAMPTZ '2025-08-20 12:00:00+00', 'form_published'),
  (7, TIMESTAMPTZ '2025-10-07 10:00:00+00', 'first_campaign_sent');
CREATE TABLE mailvora_edge_win.subscriptions AS SELECT * FROM mailvora.subscriptions LIMIT 0;
INSERT INTO mailvora_edge_win.subscriptions VALUES
  (1, 1, 'Lite', DATE '2025-07-14', DATE '2025-08-13', 15.00),
  (2, 1, 'Pro', DATE '2025-08-14', NULL, 45.00),
  (3, 2, 'Pro', DATE '2025-07-21', NULL, 45.00),
  (4, 4, 'Business', DATE '2025-08-04', NULL, 120.00),
  (5, 5, 'Lite', DATE '2025-08-19', DATE '2025-10-18', 15.00),
  (6, 7, 'Pro', DATE '2025-10-06', NULL, 45.00);
CREATE TABLE mailvora_edge_win.payments AS SELECT * FROM mailvora.payments LIMIT 0;
INSERT INTO mailvora_edge_win.payments VALUES
  (1, 1, TIMESTAMPTZ '2025-07-14 11:00:00+00', 15.00, false),
  (2, 2, TIMESTAMPTZ '2025-08-14 03:00:00+00', 45.00, false),
  (3, 2, TIMESTAMPTZ '2025-09-14 03:00:00+00', 45.00, false),
  (4, 2, TIMESTAMPTZ '2025-10-14 03:00:00+00', 45.00, false),
  (5, 3, TIMESTAMPTZ '2025-07-21 19:00:00+00', 45.00, false),
  (6, 3, TIMESTAMPTZ '2025-08-21 03:00:00+00', 45.00, false),
  (7, 3, TIMESTAMPTZ '2025-10-21 03:00:00+00', 45.00, false),
  (8, 4, TIMESTAMPTZ '2025-08-04 11:00:00+00', 120.00, false),
  (9, 4, TIMESTAMPTZ '2025-09-04 03:00:00+00', 120.00, false),
  (10, 4, TIMESTAMPTZ '2025-10-04 03:00:00+00', 120.00, false),
  (11, 5, TIMESTAMPTZ '2025-08-19 15:00:00+00', 15.00, false),
  (12, 5, TIMESTAMPTZ '2025-09-19 03:00:00+00', 15.00, true),
  (13, 6, TIMESTAMPTZ '2025-10-06 13:00:00+00', 45.00, false);

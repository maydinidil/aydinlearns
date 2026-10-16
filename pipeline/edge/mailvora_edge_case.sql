-- pipeline/edge/mailvora_edge_case.sql (family: case; S6-20, sprint 6 Part 2 Task G1)
-- The hidden data the Mailvora cases' CP3 items run on: mailvora's eleven tables, a few rows each, in Q3 2025. Planted:
--   a channel with spend and no clicks (review sites: impressions and spend, 0 clicks, and no session), so a CPC divides by zero;
--   a campaign with budget and no spend (LinkedIn's only campaign never spent, and LinkedIn has a budget each month);
--   a signup with no session (user 5), so attribution cannot credit it;
--   a user with two first-touch candidates at the same time (user 2: a Meta and an organic session at the same instant);
--   a refunded payment (user 6's first);
-- and beside them a YouTube to brand search path, a session after a signup, and direct sessions with missing UTM fields.
CREATE SCHEMA mailvora_edge_case;
CREATE TABLE mailvora_edge_case.channels AS SELECT * FROM mailvora.channels;
CREATE TABLE mailvora_edge_case.countries AS SELECT * FROM mailvora.countries;
CREATE TABLE mailvora_edge_case.fx_rates_monthly AS SELECT * FROM mailvora.fx_rates_monthly
WHERE month BETWEEN DATE '2025-07-01' AND DATE '2025-09-01';
CREATE TABLE mailvora_edge_case.campaigns AS SELECT * FROM mailvora.campaigns LIMIT 0;
INSERT INTO mailvora_edge_case.campaigns VALUES
  (1, 1, 'Search | email marketing software | 2025', 'nb_email_marketing_software_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (2, 2, 'Brand | mailvora | 2025', 'brand_mailvora_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (3, 3, 'Meta | prospecting | coaches | 2025', 'meta_prospecting_coaches_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (4, 4, 'LinkedIn | marketing managers | 2025', 'li_marketing_managers_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (5, 5, 'YouTube | flight 09 | tutorial', 'yt_f09_tutorial', DATE '2025-08-04', DATE '2025-08-17'),
  (6, 6, 'Capterra | email marketing | 2025', 'rv_capterra_email_marketing_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (7, 7, 'Affiliate | dealhub | 2025', 'aff_dealhub_2025', DATE '2025-01-01', DATE '2025-12-31'),
  (8, 7, 'Affiliate | smbtools | 2025', 'aff_smbtools_2025', DATE '2025-01-01', DATE '2025-12-31');
CREATE TABLE mailvora_edge_case.ad_spend_daily AS SELECT * FROM mailvora.ad_spend_daily LIMIT 0;
INSERT INTO mailvora_edge_case.ad_spend_daily VALUES
  (DATE '2025-07-15', 1, 4100, 140, 336.00, 'EUR', 'UTC'),
  (DATE '2025-08-20', 1, 3900, 135, 324.00, 'EUR', 'UTC'),
  (DATE '2025-09-04', 1, 4300, 150, 360.00, 'EUR', 'UTC'),
  (DATE '2025-07-15', 2, 1500, 105, 57.75, 'EUR', 'UTC'),
  (DATE '2025-08-20', 2, 1400, 98, 53.90, 'EUR', 'UTC'),
  (DATE '2025-09-04', 2, 1600, 112, 61.60, 'EUR', 'UTC'),
  (DATE '2025-07-15', 3, 52000, 570, 541.50, 'EUR', 'UTC'),
  (DATE '2025-08-20', 3, 61000, 670, 636.50, 'EUR', 'UTC'),
  (DATE '2025-09-02', 3, 58000, 640, 608.00, 'EUR', 'UTC'),
  (DATE '2025-09-06', 3, 60000, 655, 622.25, 'EUR', 'UTC'),
  (DATE '2025-08-05', 5, 150000, 430, 1200.00, 'EUR', 'UTC'),
  (DATE '2025-08-06', 5, 145000, 410, 1150.00, 'EUR', 'UTC'),
  (DATE '2025-07-15', 6, 40, 0, 12.40, 'EUR', 'UTC'),
  (DATE '2025-09-10', 6, 44, 0, 12.40, 'EUR', 'UTC'),
  (DATE '2025-08-12', 7, 4800, 120, 135.00, 'EUR', 'UTC'),
  (DATE '2025-09-04', 7, 5000, 125, 140.00, 'EUR', 'UTC'),
  (DATE '2025-08-12', 8, 1200, 30, 50.00, 'EUR', 'UTC');
CREATE TABLE mailvora_edge_case.budget_monthly AS SELECT * FROM mailvora.budget_monthly LIMIT 0;
INSERT INTO mailvora_edge_case.budget_monthly VALUES
  (DATE '2025-07-01', 1, 330.00), (DATE '2025-08-01', 1, 330.00), (DATE '2025-09-01', 1, 330.00),
  (DATE '2025-07-01', 2, 60.00), (DATE '2025-08-01', 2, 60.00), (DATE '2025-09-01', 2, 60.00),
  (DATE '2025-07-01', 3, 500.00), (DATE '2025-08-01', 3, 500.00), (DATE '2025-09-01', 3, 1000.00),
  (DATE '2025-07-01', 4, 250.00), (DATE '2025-08-01', 4, 250.00), (DATE '2025-09-01', 4, 250.00),
  (DATE '2025-07-01', 5, 0.00), (DATE '2025-08-01', 5, 2400.00), (DATE '2025-09-01', 5, 0.00),
  (DATE '2025-07-01', 6, 12.00), (DATE '2025-08-01', 6, 12.00), (DATE '2025-09-01', 6, 12.00),
  (DATE '2025-07-01', 7, 0.00), (DATE '2025-08-01', 7, 180.00), (DATE '2025-09-01', 7, 150.00);
CREATE TABLE mailvora_edge_case.sessions AS SELECT * FROM mailvora.sessions LIMIT 0;
INSERT INTO mailvora_edge_case.sessions VALUES
  (1, 'V9000001', TIMESTAMPTZ '2025-08-05 10:00:00+00', 'youtube', 'video', 'yt_f09_tutorial', '/tutorials', 'desktop', 'IE'),
  (2, 'V9000001', TIMESTAMPTZ '2025-08-20 09:50:00+00', 'google', 'cpc', 'brand_mailvora_2025', '/', 'desktop', 'IE'),
  (3, 'V9000002', TIMESTAMPTZ '2025-09-02 08:00:00+00', 'facebook', 'paid_social', 'meta_prospecting_coaches_2025', '/lp/free-newsletter', 'mobile', 'DE'),
  (4, 'V9000002', TIMESTAMPTZ '2025-09-02 08:00:00+00', 'google', 'organic', NULL, '/blog/newsletter-ideas', 'mobile', 'DE'),
  (5, 'V9000002', TIMESTAMPTZ '2025-09-03 19:10:00+00', NULL, NULL, NULL, '/', 'desktop', 'DE'),
  (6, 'V9000003', TIMESTAMPTZ '2025-09-04 11:05:00+00', 'google', 'cpc', 'nb_email_marketing_software_2025', '/pricing', 'desktop', 'FR'),
  (7, 'V9000004', TIMESTAMPTZ '2025-09-04 14:20:00+00', 'dealhub', 'affiliate', 'aff_dealhub_2025', '/lp/deal', 'mobile', 'ES'),
  (8, 'V9000006', TIMESTAMPTZ '2025-07-15 09:30:00+00', 'google', 'organic', NULL, '/pricing', 'desktop', 'NL'),
  (9, 'V9000007', TIMESTAMPTZ '2025-08-12 16:40:00+00', NULL, NULL, NULL, '/', 'desktop', 'IT'),
  (10, 'V9000008', TIMESTAMPTZ '2025-07-15 10:15:00+00', 'google', 'organic', NULL, '/templates', 'desktop', 'PL'),
  (11, 'V9000008', TIMESTAMPTZ '2025-07-20 10:00:00+00', NULL, NULL, NULL, '/login', 'desktop', 'PL'),
  (12, 'V9000020', TIMESTAMPTZ '2025-07-15 21:00:00+00', 'facebook', 'paid_social', 'meta_prospecting_coaches_2025', '/lp/grow-your-list', 'mobile', 'GR'),
  (13, 'V9000021', TIMESTAMPTZ '2025-08-06 18:30:00+00', 'youtube', 'video', 'yt_f09_tutorial', '/', 'mobile', 'FI'),
  (14, 'V9000022', TIMESTAMPTZ '2025-08-12 12:00:00+00', 'smbtools', 'affiliate', 'aff_smbtools_2025', '/pricing', 'desktop', 'BE'),
  (15, 'V9000023', TIMESTAMPTZ '2025-09-10 08:45:00+00', 'reddit.com', 'referral', NULL, '/', 'desktop', 'SE');
CREATE TABLE mailvora_edge_case.signups AS SELECT * FROM mailvora.signups LIMIT 0;
INSERT INTO mailvora_edge_case.signups VALUES
  (1, 'V9000001', TIMESTAMPTZ '2025-08-20 10:00:00+00', 'IE', 'brightcafe.ie'),
  (2, 'V9000002', TIMESTAMPTZ '2025-09-03 19:30:00+00', 'DE', 'gmx.de'),
  (3, 'V9000003', TIMESTAMPTZ '2025-09-04 11:20:00+00', 'FR', 'orange.fr'),
  (4, 'V9000004', TIMESTAMPTZ '2025-09-04 14:25:00+00', 'ES', 'mailinator.com'),
  (5, 'V9000005', TIMESTAMPTZ '2025-09-05 09:00:00+00', 'AT', 'gmail.com'),
  (6, 'V9000006', TIMESTAMPTZ '2025-07-15 09:45:00+00', 'NL', 'greenstudio.nl'),
  (7, 'V9000007', TIMESTAMPTZ '2025-08-12 16:55:00+00', 'IT', 'libero.it'),
  (8, 'V9000008', TIMESTAMPTZ '2025-07-15 10:30:00+00', 'PL', 'oakdesign.pl');
CREATE TABLE mailvora_edge_case.activation_events AS SELECT * FROM mailvora.activation_events LIMIT 0;
INSERT INTO mailvora_edge_case.activation_events VALUES
  (1, TIMESTAMPTZ '2025-08-21 08:00:00+00', 'first_campaign_sent'),
  (1, TIMESTAMPTZ '2025-08-28 08:00:00+00', 'campaign_sent'),
  (2, TIMESTAMPTZ '2025-09-04 20:00:00+00', 'first_campaign_sent'),
  (3, TIMESTAMPTZ '2025-09-06 10:00:00+00', 'first_campaign_sent'),
  (6, TIMESTAMPTZ '2025-07-16 09:00:00+00', 'first_campaign_sent'),
  (6, TIMESTAMPTZ '2025-07-20 09:00:00+00', 'list_imported'),
  (8, TIMESTAMPTZ '2025-07-16 12:00:00+00', 'first_campaign_sent');
CREATE TABLE mailvora_edge_case.subscriptions AS SELECT * FROM mailvora.subscriptions LIMIT 0;
INSERT INTO mailvora_edge_case.subscriptions VALUES
  (1, 6, 'Pro', DATE '2025-07-20', NULL, 45.00),
  (2, 8, 'Lite', DATE '2025-07-25', DATE '2025-08-24', 15.00),
  (3, 8, 'Pro', DATE '2025-08-25', NULL, 45.00),
  (4, 1, 'Business', DATE '2025-09-01', NULL, 120.00);
CREATE TABLE mailvora_edge_case.payments AS SELECT * FROM mailvora.payments LIMIT 0;
INSERT INTO mailvora_edge_case.payments VALUES
  (1, 1, TIMESTAMPTZ '2025-07-20 03:00:00+00', 45.00, true),
  (2, 2, TIMESTAMPTZ '2025-07-25 03:00:00+00', 15.00, false),
  (3, 1, TIMESTAMPTZ '2025-08-20 03:00:00+00', 45.00, false),
  (4, 3, TIMESTAMPTZ '2025-08-25 03:00:00+00', 45.00, false),
  (5, 4, TIMESTAMPTZ '2025-09-01 03:00:00+00', 120.00, false),
  (6, 1, TIMESTAMPTZ '2025-09-20 03:00:00+00', 45.00, false),
  (7, 3, TIMESTAMPTZ '2025-09-25 03:00:00+00', 45.00, false);
-- Ruling P40 (sprint 6 Part 2, Task H1 follow-up): three more plants, appended; every row above is unchanged. Planted:
--   a Q3 2025 paying user with no session (user 9), so attribution has no channel to credit the revenue to;
--   a Q3 2025 paying user whose first two sessions start at the same moment, from two channels (user 10, then a later session);
--   a September 2025 signup that activates after its first 7 days but subscribes and pays within 30 days (user 11).
INSERT INTO mailvora_edge_case.sessions VALUES
  (16, 'V9000031', TIMESTAMPTZ '2025-08-06 07:15:00+00', 'youtube', 'video', 'yt_f09_tutorial', '/tutorials', 'mobile', 'FI'),
  (17, 'V9000031', TIMESTAMPTZ '2025-08-06 07:15:00+00', 'google', 'organic', NULL, '/blog/welcome-emails', 'mobile', 'FI'),
  (18, 'V9000031', TIMESTAMPTZ '2025-08-20 08:10:00+00', 'google', 'cpc', 'brand_mailvora_2025', '/', 'desktop', 'FI'),
  (19, 'V9000032', TIMESTAMPTZ '2025-09-08 09:40:00+00', 'google', 'organic', NULL, '/blog/welcome-series', 'desktop', 'SE');
INSERT INTO mailvora_edge_case.signups VALUES
  (9, 'V9000030', TIMESTAMPTZ '2025-07-05 11:00:00+00', 'BE', 'atelierlumen.be'),
  (10, 'V9000031', TIMESTAMPTZ '2025-08-20 08:30:00+00', 'FI', 'saunatalo.fi'),
  (11, 'V9000032', TIMESTAMPTZ '2025-09-08 10:00:00+00', 'SE', 'nordbageri.se');
INSERT INTO mailvora_edge_case.activation_events VALUES
  (9, TIMESTAMPTZ '2025-07-06 09:00:00+00', 'first_campaign_sent'),
  (10, TIMESTAMPTZ '2025-08-21 10:00:00+00', 'first_campaign_sent'),
  (11, TIMESTAMPTZ '2025-09-17 12:00:00+00', 'first_campaign_sent');
INSERT INTO mailvora_edge_case.subscriptions VALUES
  (5, 9, 'Lite', DATE '2025-07-08', NULL, 15.00),
  (6, 10, 'Pro', DATE '2025-08-25', NULL, 45.00),
  (7, 11, 'Lite', DATE '2025-09-20', NULL, 15.00);
INSERT INTO mailvora_edge_case.payments VALUES
  (8, 5, TIMESTAMPTZ '2025-07-08 03:00:00+00', 15.00, false),
  (9, 5, TIMESTAMPTZ '2025-08-08 03:00:00+00', 15.00, false),
  (10, 6, TIMESTAMPTZ '2025-08-25 03:00:00+00', 45.00, false),
  (11, 6, TIMESTAMPTZ '2025-09-25 03:00:00+00', 45.00, false),
  (12, 7, TIMESTAMPTZ '2025-09-20 03:00:00+00', 15.00, false);

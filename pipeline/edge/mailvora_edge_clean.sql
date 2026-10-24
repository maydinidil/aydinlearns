-- pipeline/edge/mailvora_edge_clean.sql (family: clean; sprint 7 Part 2, Task G1, S7-15)
-- Mirrors mailvora_raw, with every one of its table names and no view: the edge schema of the take-home on raw Mailvora data
-- (TAKE-HOME-B), as voltmarkt_edge_clean is voltmarkt_raw's. Fictional data, a few rows a table in Q3 2025 and October, apart from
-- two bots.
-- Each raw quirk (knowledge/05 CO-03) is here in a case mailvora_raw does not show, so a query fitted to the visible quirks
-- fails, while the rules in mailvora_raw's notes clean every row. Planted:
--   Q-03-01: Meta sessions in raw's spellings (fb, ig, Paid-Social, cpc) and in two it lacks (utm_source instagram, utm_medium
--   paid-social); LinkedIn sessions spelled LinkedIn and linkedin.com, with utm_medium Paid-Social and social. Every one keeps
--   its utm_campaign, so the channel rule still maps it;
--   Q-03-02: LinkedIn rows on the Los Angeles day, one dated 31 July (1 August in UTC); Capterra rows on the Los Angeles day too;
--   and one LinkedIn row exported in UTC (20 August), which is not shifted;
--   Q-03-03: LinkedIn rows in US dollars, G2 rows in US dollars (in UTC), an affiliate row in British pounds with a GBP rate for
--   each month, and the UTC LinkedIn row in euros. A rate is the month of the row's UTC day: the row dated 31 July takes August's;
--   Q-03-04: Meta's rows of 14 and 15 July loaded twice, as in raw, and a nonbrand search row of 5 August loaded three times;
--   Q-03-05: a bot with 230 sessions on 2 September and no UTM fields, as in raw, and one with exactly 200 sessions on 12 August,
--   each tagged google and organic;
--   Q-03-06: a direct session with all three UTM fields empty, as in raw; a direct session with only utm_source empty; an organic
--   session with only utm_campaign empty. Visitors 14 and 15 came earlier through a campaign, so their last touch depends on it;
--   Q-03-07: 2 of August's 3 payments refunded, one of them a 120 euro payment: most of August's money, far from raw's 4%; and
--   (sprint 7d, Task K2, S7D-13) both of October's payments refunded, in a month with spend (one nonbrand search row on 6 October,
--   and fx_rates_monthly holds October's dollar and pound rates, as it holds every month's):
--   a shape mailvora_raw lacks, so October's revenue is 0, which neither a share fitted to raw's 4% nor a sum with no 0 for a month
--   without revenue gives. 4 of the 10 payments are refunded (pipeline/tests/test_edge_7d.py).
-- Every campaign session falls on a UTC day its campaign had clicks, once the Los Angeles days are shifted; every signup follows a
-- session of its visitor; the channels, the campaigns and the dollar rates are mailvora_raw's own rows.
CREATE SCHEMA mailvora_edge_clean;
CREATE TABLE mailvora_edge_clean.channels AS SELECT * FROM mailvora_raw.channels;
CREATE TABLE mailvora_edge_clean.campaigns AS SELECT * FROM mailvora_raw.campaigns
WHERE campaign_id IN (25, 53, 86, 87, 114, 153, 158, 172);
CREATE TABLE mailvora_edge_clean.fx_rates_monthly AS SELECT * FROM mailvora_raw.fx_rates_monthly
WHERE month BETWEEN DATE '2025-07-01' AND DATE '2025-10-01';
INSERT INTO mailvora_edge_clean.fx_rates_monthly VALUES
  (DATE '2025-07-01', 'GBP', 1.168200), (DATE '2025-08-01', 'GBP', 1.161500), (DATE '2025-09-01', 'GBP', 1.172400),
  (DATE '2025-10-01', 'GBP', 1.169800);
CREATE TABLE mailvora_edge_clean.ad_spend_daily AS SELECT * FROM mailvora_raw.ad_spend_daily LIMIT 0;
INSERT INTO mailvora_edge_clean.ad_spend_daily VALUES
  (DATE '2025-07-14', 25, 4100, 140, 336.00, 'EUR', 'UTC'),
  (DATE '2025-08-05', 25, 3900, 135, 324.00, 'EUR', 'UTC'),
  (DATE '2025-08-05', 25, 3900, 135, 324.00, 'EUR', 'UTC'),
  (DATE '2025-08-05', 25, 3900, 135, 324.00, 'EUR', 'UTC'),
  (DATE '2025-09-04', 25, 4300, 150, 360.00, 'EUR', 'UTC'),
  (DATE '2025-10-06', 25, 4200, 145, 348.00, 'EUR', 'UTC'),
  (DATE '2025-07-15', 53, 1500, 105, 57.75, 'EUR', 'UTC'),
  (DATE '2025-08-20', 53, 1400, 98, 53.90, 'EUR', 'UTC'),
  (DATE '2025-07-14', 87, 52000, 570, 541.50, 'EUR', 'UTC'),
  (DATE '2025-07-14', 87, 52000, 570, 541.50, 'EUR', 'UTC'),
  (DATE '2025-07-15', 87, 48000, 530, 503.50, 'EUR', 'UTC'),
  (DATE '2025-07-15', 87, 48000, 530, 503.50, 'EUR', 'UTC'),
  (DATE '2025-08-12', 87, 61000, 670, 636.50, 'EUR', 'UTC'),
  (DATE '2025-08-12', 86, 20000, 240, 228.00, 'EUR', 'UTC'),
  (DATE '2025-09-02', 86, 22000, 250, 237.50, 'EUR', 'UTC'),
  (DATE '2025-07-08', 114, 2600, 14, 92.00, 'USD', 'America/Los_Angeles'),
  (DATE '2025-07-31', 114, 2900, 16, 104.00, 'USD', 'America/Los_Angeles'),
  (DATE '2025-09-01', 114, 2700, 15, 98.00, 'USD', 'America/Los_Angeles'),
  (DATE '2025-08-20', 114, 2500, 14, 84.00, 'EUR', 'UTC'),
  (DATE '2025-07-31', 153, 400, 36, 111.60, 'EUR', 'America/Los_Angeles'),
  (DATE '2025-08-25', 153, 380, 34, 105.40, 'EUR', 'America/Los_Angeles'),
  (DATE '2025-08-26', 158, 350, 30, 101.00, 'USD', 'UTC'),
  (DATE '2025-09-04', 158, 330, 29, 98.00, 'USD', 'UTC'),
  (DATE '2025-09-04', 172, 1200, 30, 45.00, 'GBP', 'UTC');
CREATE TABLE mailvora_edge_clean.sessions AS SELECT * FROM mailvora_raw.sessions LIMIT 0;
INSERT INTO mailvora_edge_clean.sessions VALUES
  (1, 'V9200001', TIMESTAMPTZ '2025-07-14 19:30:00+00', 'fb', 'Paid-Social', 'meta_prospecting_coaches_2025', '/lp/free-newsletter', 'mobile', 'DE'),
  (2, 'V9200002', TIMESTAMPTZ '2025-07-15 20:10:00+00', 'ig', 'cpc', 'meta_prospecting_coaches_2025', '/lp/grow-your-list', 'mobile', 'FR'),
  (3, 'V9200003', TIMESTAMPTZ '2025-08-12 18:00:00+00', 'instagram', 'paid-social', 'meta_retargeting_shop_owners_2025', '/', 'mobile', 'ES'),
  (4, 'V9200004', TIMESTAMPTZ '2025-08-12 21:00:00+00', 'facebook', 'paid_social', 'meta_prospecting_coaches_2025', '/lp/free-newsletter', 'mobile', 'IT'),
  (5, 'V9200005', TIMESTAMPTZ '2025-07-09 09:15:00+00', 'linkedin', 'paid_social', 'li_marketing_managers_2025', '/lp/b2b-email', 'desktop', 'NL'),
  (6, 'V9200006', TIMESTAMPTZ '2025-08-01 08:30:00+00', 'LinkedIn', 'Paid-Social', 'li_marketing_managers_2025', '/features/automation', 'desktop', 'BE'),
  (7, 'V9200007', TIMESTAMPTZ '2025-08-20 10:00:00+00', 'linkedin.com', 'social', 'li_marketing_managers_2025', '/lp/b2b-email', 'desktop', 'IE'),
  (8, 'V9200008', TIMESTAMPTZ '2025-08-01 14:00:00+00', 'capterra', 'cpc', 'rv_capterra_email_marketing_2025', '/pricing', 'desktop', 'AT'),
  (9, 'V9200009', TIMESTAMPTZ '2025-08-26 11:00:00+00', 'g2', 'cpc', 'rv_g2_newsletter_2025', '/features', 'desktop', 'SE'),
  (10, 'V9200010', TIMESTAMPTZ '2025-08-05 10:10:00+00', 'google', 'cpc', 'nb_email_marketing_software_2025', '/pricing', 'desktop', 'DE'),
  (11, 'V9200011', TIMESTAMPTZ '2025-07-15 09:00:00+00', 'google', 'cpc', 'brand_mailvora_2025', '/', 'desktop', 'NL'),
  (12, 'V9200012', TIMESTAMPTZ '2025-09-04 12:00:00+00', 'growthclub', 'affiliate', 'aff_growthclub_2025', '/lp/deal', 'mobile', 'PL'),
  (13, 'V9200013', TIMESTAMPTZ '2025-08-20 15:00:00+00', '', '', '', '/', 'desktop', 'NL'),
  (14, 'V9200014', TIMESTAMPTZ '2025-09-02 16:00:00+00', '', NULL, NULL, '/pricing', 'desktop', 'FR'),
  (15, 'V9200015', TIMESTAMPTZ '2025-09-04 09:00:00+00', 'google', 'organic', '', '/blog/newsletter-ideas', 'desktop', 'IE'),
  (16, 'V9200016', TIMESTAMPTZ '2025-07-20 10:00:00+00', NULL, NULL, NULL, '/', 'desktop', 'PT'),
  (17, 'V9200017', TIMESTAMPTZ '2025-08-12 08:00:00+00', 'bing', 'organic', NULL, '/templates', 'desktop', 'DK'),
  (18, 'V9200014', TIMESTAMPTZ '2025-08-05 13:00:00+00', 'google', 'cpc', 'nb_email_marketing_software_2025', '/features', 'desktop', 'FR'),
  (19, 'V9200015', TIMESTAMPTZ '2025-08-26 15:00:00+00', 'g2', 'cpc', 'rv_g2_newsletter_2025', '/pricing', 'desktop', 'IE');
-- Q-03-05: the two bots, appended after the visitors' sessions as raw appends its own, one session a minute from 10:01 UTC, so each
-- bot's day is the same date in UTC, in Europe and in Los Angeles.
INSERT INTO mailvora_edge_clean.sessions
SELECT 100 + i, 'V9200090', TIMESTAMPTZ '2025-08-12 10:00:00+00' + to_minutes(i), 'google', 'organic', NULL, '/templates', 'desktop', 'FR'
FROM range(1, 201) AS r(i);
INSERT INTO mailvora_edge_clean.sessions
SELECT 300 + i, 'V9200091', TIMESTAMPTZ '2025-09-02 10:00:00+00' + to_minutes(i), NULL, NULL, NULL, '/', 'desktop', 'NL'
FROM range(1, 231) AS r(i);
CREATE TABLE mailvora_edge_clean.signups AS SELECT * FROM mailvora_raw.signups LIMIT 0;
INSERT INTO mailvora_edge_clean.signups VALUES
  (1, 'V9200001', TIMESTAMPTZ '2025-07-14 19:50:00+00', 'DE', 'gmx.de'),
  (2, 'V9200002', TIMESTAMPTZ '2025-07-15 20:30:00+00', 'FR', 'orange.fr'),
  (3, 'V9200003', TIMESTAMPTZ '2025-08-12 18:20:00+00', 'ES', 'gmail.com'),
  (4, 'V9200005', TIMESTAMPTZ '2025-07-09 09:40:00+00', 'NL', 'outlook.com'),
  (5, 'V9200006', TIMESTAMPTZ '2025-08-01 08:50:00+00', 'BE', 'gmail.com'),
  (6, 'V9200007', TIMESTAMPTZ '2025-08-20 10:30:00+00', 'IE', 'outlook.com'),
  (7, 'V9200008', TIMESTAMPTZ '2025-08-01 14:20:00+00', 'AT', 'gmail.com'),
  (8, 'V9200009', TIMESTAMPTZ '2025-08-26 11:30:00+00', 'SE', 'outlook.com'),
  (9, 'V9200010', TIMESTAMPTZ '2025-08-05 10:40:00+00', 'DE', 'web.de'),
  (10, 'V9200012', TIMESTAMPTZ '2025-09-04 12:15:00+00', 'PL', 'wp.pl'),
  (11, 'V9200013', TIMESTAMPTZ '2025-08-20 15:10:00+00', 'NL', 'gmail.com'),
  (12, 'V9200014', TIMESTAMPTZ '2025-09-02 16:20:00+00', 'FR', 'laposte.net'),
  (13, 'V9200015', TIMESTAMPTZ '2025-09-04 09:30:00+00', 'IE', 'gmail.com');
CREATE TABLE mailvora_edge_clean.payments AS SELECT * FROM mailvora_raw.payments LIMIT 0;
INSERT INTO mailvora_edge_clean.payments VALUES
  (1, 1, TIMESTAMPTZ '2025-07-20 03:00:00+00', 45.00, false),
  (2, 2, TIMESTAMPTZ '2025-07-25 03:00:00+00', 15.00, false),
  (3, 1, TIMESTAMPTZ '2025-08-20 03:00:00+00', 45.00, true),
  (4, 3, TIMESTAMPTZ '2025-08-25 03:00:00+00', 120.00, true),
  (5, 2, TIMESTAMPTZ '2025-08-25 03:00:00+00', 15.00, false),
  (6, 4, TIMESTAMPTZ '2025-09-01 03:00:00+00', 45.00, false),
  (7, 1, TIMESTAMPTZ '2025-09-20 03:00:00+00', 45.00, false),
  (8, 3, TIMESTAMPTZ '2025-09-25 03:00:00+00', 120.00, false),
  (9, 1, TIMESTAMPTZ '2025-10-20 03:00:00+00', 45.00, true),
  (10, 3, TIMESTAMPTZ '2025-10-25 03:00:00+00', 120.00, true);

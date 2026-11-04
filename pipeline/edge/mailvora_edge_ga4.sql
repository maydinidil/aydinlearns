-- pipeline/edge/mailvora_edge_ga4.sql (family: SQL-BQ-01, SQL-CRAFT-01 to -03; level 7)
-- Sprint 9 (Task L1, S9-03): the hidden data of the level 7 items on mailvora_ga4. It mirrors mailvora_ga4.events and the four mailvora
-- tables a level 7 item joins (sessions, signups, subscriptions, payments) under the same names and columns. Planted
-- (pipeline/tests/test_mailvora_ga4.py holds each), one row or pair each:
--   an event with an empty event_params: visitor V9500006's second page_view;
--   a purchase with value in int_value: user 2's (beside two in double_value, user 1's and user 3's);
--   two visitors sharing a ga_session_id: V9500003 and V9500004 both start a session at 2025-11-04 10:15:42 UTC;
--   a website event with no ga_session_id (its other parameters there): V9500007's second page_view;
--   an event with no user_pseudo_id (its ga_session_id there): V9500008's second page_view;
--   both sides of the Dublin day boundary: a page_view at 23:30 UTC on 2025-10-25 (Irish summer time: event_date 20251026) and one at
--   23:30 UTC on 2025-10-27 (after the clock change: event_date 20251027);
--   a page_location with a query string: V9500008's third page_view;
--   a session with no page_view: V9500005's.
-- And ruling S9-C29's: a purchase whose first payment is refunded (user 3, V9500007, signed up in that visitor's session), so a hidden
-- run tests how a key treats a refunded first payment; the purchase is in events all the same (as in mailvora_ga4).
-- And ruling S9-C42's (review F2-1-1): a new visitor's first session at 23:32 UTC on 2025-09-30 and its sign_up at 23:38 (user 4,
-- V9500009), all dated 20251001 in Dublin (Irish summer time), with its sessions and signups rows, so a window from 1 October read
-- by the UTC day, on the export side or the backend side, loses them (the boundary plants above sit inside a whole-October or a
-- fourth-quarter window, so they move nothing across its edge).
-- Beside them it follows mailvora_ga4's rules (pipeline/mailvora/ga4.py): every session is a row of sessions and has one
-- session_start, with first_visit on the visitor's first session, and each of its events comes within 30 minutes of the one before;
-- sign_up at each signup, in the visitor's latest session; purchase at each subscription's first payment (user 1's second payment has
-- none), sent by the billing server (S9-C17): no session, no page_location and no device, the account's country as geo; user_id
-- from the sign_up on; event_date is the Dublin day; traffic_source the visitor's first session.
CREATE SCHEMA mailvora_edge_ga4;
CREATE TABLE mailvora_edge_ga4.sessions AS SELECT * FROM mailvora.sessions LIMIT 0;
INSERT INTO mailvora_edge_ga4.sessions VALUES
  (1, 'V9500001', TIMESTAMPTZ '2025-10-25 23:28:00+00', 'google', 'organic', NULL, '/', 'desktop', 'IE'),
  (2, 'V9500002', TIMESTAMPTZ '2025-10-27 23:20:00+00', 'google', 'cpc', 'nb_email_marketing_software_2025', '/pricing', 'desktop', 'NL'),
  (3, 'V9500003', TIMESTAMPTZ '2025-11-04 10:15:42+00', 'facebook', 'paid_social', 'meta_prospecting_coaches_2025', '/lp/free-newsletter', 'mobile', 'DE'),
  (4, 'V9500004', TIMESTAMPTZ '2025-11-04 10:15:42+00', NULL, NULL, NULL, '/', 'desktop', 'FR'),
  (5, 'V9500005', TIMESTAMPTZ '2025-11-12 14:00:00+00', 'reddit.com', 'referral', NULL, '/blog/newsletter-ideas', 'desktop', 'IE'),
  (6, 'V9500006', TIMESTAMPTZ '2025-11-20 09:05:00+00', 'bing', 'organic', NULL, '/templates', 'tablet', 'ES'),
  (7, 'V9500007', TIMESTAMPTZ '2025-12-03 16:45:00+00', 'google', 'organic', NULL, '/features', 'desktop', 'BE'),
  (8, 'V9500008', TIMESTAMPTZ '2025-12-09 08:10:00+00', 'linkedin', 'paid_social', 'li_marketing_managers_2025', '/lp/b2b-email', 'desktop', 'NL'),
  (9, 'V9500001', TIMESTAMPTZ '2025-12-15 12:00:00+00', NULL, NULL, NULL, '/', 'desktop', 'IE'),
  (10, 'V9500009', TIMESTAMPTZ '2025-09-30 23:32:00+00', 'google', 'organic', NULL, '/templates', 'mobile', 'IE');
CREATE TABLE mailvora_edge_ga4.signups AS SELECT * FROM mailvora.signups LIMIT 0;
INSERT INTO mailvora_edge_ga4.signups VALUES
  (1, 'V9500002', TIMESTAMPTZ '2025-10-27 23:40:00+00', 'NL', 'brightcafe.nl'),
  (2, 'V9500003', TIMESTAMPTZ '2025-11-04 10:25:00+00', 'DE', 'gmx.de'),
  (3, 'V9500007', TIMESTAMPTZ '2025-12-03 16:50:00+00', 'BE', 'greenstudio.be'),
  (4, 'V9500009', TIMESTAMPTZ '2025-09-30 23:38:00+00', 'IE', 'liffeyprint.ie');
CREATE TABLE mailvora_edge_ga4.subscriptions AS SELECT * FROM mailvora.subscriptions LIMIT 0;
INSERT INTO mailvora_edge_ga4.subscriptions VALUES
  (1, 1, 'Pro', DATE '2025-11-27', NULL, 45.00),
  (2, 2, 'Lite', DATE '2025-12-02', NULL, 15.00),
  (3, 3, 'Business', DATE '2025-12-10', NULL, 120.00);
CREATE TABLE mailvora_edge_ga4.payments AS SELECT * FROM mailvora.payments LIMIT 0;
INSERT INTO mailvora_edge_ga4.payments VALUES
  (1, 1, TIMESTAMPTZ '2025-11-27 03:00:00+00', 45.00, false),
  (2, 2, TIMESTAMPTZ '2025-12-02 03:00:00+00', 15.00, false),
  (3, 1, TIMESTAMPTZ '2025-12-27 03:00:00+00', 45.00, false),
  (4, 3, TIMESTAMPTZ '2025-12-10 03:00:00+00', 120.00, true);
-- The events, one flat row each: the session's start gives ga_session_id (missing on the no-ga_session_id plant and the empty one);
-- a parameter whose value is missing is left out of event_params, as in mailvora_ga4, so an event with none has an empty list.
CREATE TABLE mailvora_edge_ga4.events AS SELECT * FROM mailvora_ga4.events LIMIT 0;
INSERT INTO mailvora_edge_ga4.events
SELECT v.event_date, epoch_us(v.event_at), v.event_name,
       list_filter([
           {'key': 'ga_session_id', 'value': {'string_value': NULL::VARCHAR, 'int_value': CAST(epoch(v.session_at) AS BIGINT), 'float_value': NULL::DOUBLE, 'double_value': NULL::DOUBLE}},
           {'key': 'ga_session_number', 'value': {'string_value': NULL::VARCHAR, 'int_value': CAST(v.session_number AS BIGINT), 'float_value': NULL::DOUBLE, 'double_value': NULL::DOUBLE}},
           {'key': 'page_location', 'value': {'string_value': 'https://www.mailvora.example' || v.path, 'int_value': NULL::BIGINT, 'float_value': NULL::DOUBLE, 'double_value': NULL::DOUBLE}},
           {'key': 'session_engaged', 'value': {'string_value': v.engaged, 'int_value': NULL::BIGINT, 'float_value': NULL::DOUBLE, 'double_value': NULL::DOUBLE}},
           {'key': 'engagement_time_msec', 'value': {'string_value': NULL::VARCHAR, 'int_value': CAST(v.msec AS BIGINT), 'float_value': NULL::DOUBLE, 'double_value': NULL::DOUBLE}},
           {'key': 'value', 'value': {'string_value': NULL::VARCHAR, 'int_value': NULL::BIGINT, 'float_value': NULL::DOUBLE, 'double_value': CAST(v.value_double AS DOUBLE)}},
           {'key': 'value', 'value': {'string_value': NULL::VARCHAR, 'int_value': CAST(v.value_int AS BIGINT), 'float_value': NULL::DOUBLE, 'double_value': NULL::DOUBLE}}
       ], lambda p: p.value.string_value IS NOT NULL OR p.value.int_value IS NOT NULL OR p.value.double_value IS NOT NULL),
       v.user_id, v.user_pseudo_id,
       {'name': v.ts_name, 'medium': v.ts_medium, 'source': v.ts_source},
       CASE WHEN v.device IS NOT NULL THEN {'category': v.device} END, {'country': v.country},
       CASE WHEN v.txn IS NOT NULL THEN {'transaction_id': v.txn, 'purchase_revenue': CAST(v.revenue AS DOUBLE)} END
FROM (VALUES
  -- V9500001's first session, starting at 00:28 in Dublin on 26 October: its second page_view is at 23:30 UTC on 25 October.
  ('20251026', TIMESTAMPTZ '2025-10-25 23:28:00.000100+00', 'first_visit', TIMESTAMPTZ '2025-10-25 23:28:00+00', 1, '/', '1', NULL, NULL, NULL, NULL, 'V9500001', '(organic)', 'organic', 'google', 'desktop', 'Ireland', NULL, NULL),
  ('20251026', TIMESTAMPTZ '2025-10-25 23:28:00.000100+00', 'session_start', TIMESTAMPTZ '2025-10-25 23:28:00+00', 1, '/', '1', NULL, NULL, NULL, NULL, 'V9500001', '(organic)', 'organic', 'google', 'desktop', 'Ireland', NULL, NULL),
  ('20251026', TIMESTAMPTZ '2025-10-25 23:28:00.000100+00', 'page_view', TIMESTAMPTZ '2025-10-25 23:28:00+00', 1, '/', '1', 120000, NULL, NULL, NULL, 'V9500001', '(organic)', 'organic', 'google', 'desktop', 'Ireland', NULL, NULL),
  ('20251026', TIMESTAMPTZ '2025-10-25 23:30:00.000200+00', 'page_view', TIMESTAMPTZ '2025-10-25 23:28:00+00', 1, '/pricing', '1', 20000, NULL, NULL, NULL, 'V9500001', '(organic)', 'organic', 'google', 'desktop', 'Ireland', NULL, NULL),
  -- V9500002 (user 1): a page_view at 23:30 UTC on 27 October, after the clock change, then the sign_up.
  ('20251027', TIMESTAMPTZ '2025-10-27 23:20:00.000300+00', 'first_visit', TIMESTAMPTZ '2025-10-27 23:20:00+00', 1, '/pricing', '1', NULL, NULL, NULL, NULL, 'V9500002', 'nb_email_marketing_software_2025', 'cpc', 'google', 'desktop', 'Netherlands', NULL, NULL),
  ('20251027', TIMESTAMPTZ '2025-10-27 23:20:00.000300+00', 'session_start', TIMESTAMPTZ '2025-10-27 23:20:00+00', 1, '/pricing', '1', NULL, NULL, NULL, NULL, 'V9500002', 'nb_email_marketing_software_2025', 'cpc', 'google', 'desktop', 'Netherlands', NULL, NULL),
  ('20251027', TIMESTAMPTZ '2025-10-27 23:20:00.000300+00', 'page_view', TIMESTAMPTZ '2025-10-27 23:20:00+00', 1, '/pricing', '1', 600000, NULL, NULL, NULL, 'V9500002', 'nb_email_marketing_software_2025', 'cpc', 'google', 'desktop', 'Netherlands', NULL, NULL),
  ('20251027', TIMESTAMPTZ '2025-10-27 23:30:00.000400+00', 'page_view', TIMESTAMPTZ '2025-10-27 23:20:00+00', 1, '/signup', '1', 15000, NULL, NULL, NULL, 'V9500002', 'nb_email_marketing_software_2025', 'cpc', 'google', 'desktop', 'Netherlands', NULL, NULL),
  ('20251027', TIMESTAMPTZ '2025-10-27 23:40:00.000500+00', 'sign_up', TIMESTAMPTZ '2025-10-27 23:20:00+00', 1, '/signup', '1', NULL, NULL, NULL, '1', 'V9500002', 'nb_email_marketing_software_2025', 'cpc', 'google', 'desktop', 'Netherlands', NULL, NULL),
  -- S9-C42: V9500009 (user 4), at 00:32 to 00:38 in Dublin on 1 October (event_date 20251001), still 30 September by the UTC day.
  ('20251001', TIMESTAMPTZ '2025-09-30 23:32:00.002300+00', 'first_visit', TIMESTAMPTZ '2025-09-30 23:32:00+00', 1, '/templates', '1', NULL, NULL, NULL, NULL, 'V9500009', '(organic)', 'organic', 'google', 'mobile', 'Ireland', NULL, NULL),
  ('20251001', TIMESTAMPTZ '2025-09-30 23:32:00.002300+00', 'session_start', TIMESTAMPTZ '2025-09-30 23:32:00+00', 1, '/templates', '1', NULL, NULL, NULL, NULL, 'V9500009', '(organic)', 'organic', 'google', 'mobile', 'Ireland', NULL, NULL),
  ('20251001', TIMESTAMPTZ '2025-09-30 23:32:00.002300+00', 'page_view', TIMESTAMPTZ '2025-09-30 23:32:00+00', 1, '/templates', '1', 240000, NULL, NULL, NULL, 'V9500009', '(organic)', 'organic', 'google', 'mobile', 'Ireland', NULL, NULL),
  ('20251001', TIMESTAMPTZ '2025-09-30 23:36:00.002400+00', 'page_view', TIMESTAMPTZ '2025-09-30 23:32:00+00', 1, '/signup', '1', 30000, NULL, NULL, NULL, 'V9500009', '(organic)', 'organic', 'google', 'mobile', 'Ireland', NULL, NULL),
  ('20251001', TIMESTAMPTZ '2025-09-30 23:38:00.002500+00', 'sign_up', TIMESTAMPTZ '2025-09-30 23:32:00+00', 1, '/signup', '1', NULL, NULL, NULL, '4', 'V9500009', '(organic)', 'organic', 'google', 'mobile', 'Ireland', NULL, NULL),
  -- V9500003 (user 2) and V9500004 start a session in the same second, so they share a ga_session_id.
  ('20251104', TIMESTAMPTZ '2025-11-04 10:15:42.000600+00', 'first_visit', TIMESTAMPTZ '2025-11-04 10:15:42+00', 1, '/lp/free-newsletter', '1', NULL, NULL, NULL, NULL, 'V9500003', 'meta_prospecting_coaches_2025', 'paid_social', 'facebook', 'mobile', 'Germany', NULL, NULL),
  ('20251104', TIMESTAMPTZ '2025-11-04 10:15:42.000600+00', 'session_start', TIMESTAMPTZ '2025-11-04 10:15:42+00', 1, '/lp/free-newsletter', '1', NULL, NULL, NULL, NULL, 'V9500003', 'meta_prospecting_coaches_2025', 'paid_social', 'facebook', 'mobile', 'Germany', NULL, NULL),
  ('20251104', TIMESTAMPTZ '2025-11-04 10:15:42.000600+00', 'page_view', TIMESTAMPTZ '2025-11-04 10:15:42+00', 1, '/lp/free-newsletter', '1', 90000, NULL, NULL, NULL, 'V9500003', 'meta_prospecting_coaches_2025', 'paid_social', 'facebook', 'mobile', 'Germany', NULL, NULL),
  ('20251104', TIMESTAMPTZ '2025-11-04 10:17:12.000700+00', 'page_view', TIMESTAMPTZ '2025-11-04 10:15:42+00', 1, '/pricing', '1', 40000, NULL, NULL, NULL, 'V9500003', 'meta_prospecting_coaches_2025', 'paid_social', 'facebook', 'mobile', 'Germany', NULL, NULL),
  ('20251104', TIMESTAMPTZ '2025-11-04 10:25:00.000800+00', 'sign_up', TIMESTAMPTZ '2025-11-04 10:15:42+00', 1, '/signup', '1', NULL, NULL, NULL, '2', 'V9500003', 'meta_prospecting_coaches_2025', 'paid_social', 'facebook', 'mobile', 'Germany', NULL, NULL),
  ('20251104', TIMESTAMPTZ '2025-11-04 10:15:42.000900+00', 'first_visit', TIMESTAMPTZ '2025-11-04 10:15:42+00', 1, '/', '0', NULL, NULL, NULL, NULL, 'V9500004', '(direct)', '(none)', '(direct)', 'desktop', 'France', NULL, NULL),
  ('20251104', TIMESTAMPTZ '2025-11-04 10:15:42.000900+00', 'session_start', TIMESTAMPTZ '2025-11-04 10:15:42+00', 1, '/', '0', NULL, NULL, NULL, NULL, 'V9500004', '(direct)', '(none)', '(direct)', 'desktop', 'France', NULL, NULL),
  ('20251104', TIMESTAMPTZ '2025-11-04 10:15:42.000900+00', 'page_view', TIMESTAMPTZ '2025-11-04 10:15:42+00', 1, '/', '0', 4000, NULL, NULL, NULL, 'V9500004', '(direct)', '(none)', '(direct)', 'desktop', 'France', NULL, NULL),
  -- V9500005: a session with no page_view.
  ('20251112', TIMESTAMPTZ '2025-11-12 14:00:00.001000+00', 'first_visit', TIMESTAMPTZ '2025-11-12 14:00:00+00', 1, '/blog/newsletter-ideas', '0', NULL, NULL, NULL, NULL, 'V9500005', '(referral)', 'referral', 'reddit.com', 'desktop', 'Ireland', NULL, NULL),
  ('20251112', TIMESTAMPTZ '2025-11-12 14:00:00.001000+00', 'session_start', TIMESTAMPTZ '2025-11-12 14:00:00+00', 1, '/blog/newsletter-ideas', '0', NULL, NULL, NULL, NULL, 'V9500005', '(referral)', 'referral', 'reddit.com', 'desktop', 'Ireland', NULL, NULL),
  -- V9500006: a second page_view with an empty event_params.
  ('20251120', TIMESTAMPTZ '2025-11-20 09:05:00.001100+00', 'first_visit', TIMESTAMPTZ '2025-11-20 09:05:00+00', 1, '/templates', '1', NULL, NULL, NULL, NULL, 'V9500006', '(organic)', 'organic', 'bing', 'tablet', 'Spain', NULL, NULL),
  ('20251120', TIMESTAMPTZ '2025-11-20 09:05:00.001100+00', 'session_start', TIMESTAMPTZ '2025-11-20 09:05:00+00', 1, '/templates', '1', NULL, NULL, NULL, NULL, 'V9500006', '(organic)', 'organic', 'bing', 'tablet', 'Spain', NULL, NULL),
  ('20251120', TIMESTAMPTZ '2025-11-20 09:05:00.001100+00', 'page_view', TIMESTAMPTZ '2025-11-20 09:05:00+00', 1, '/templates', '1', 30000, NULL, NULL, NULL, 'V9500006', '(organic)', 'organic', 'bing', 'tablet', 'Spain', NULL, NULL),
  ('20251120', TIMESTAMPTZ '2025-11-20 09:05:30.001200+00', 'page_view', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'V9500006', '(organic)', 'organic', 'bing', 'tablet', 'Spain', NULL, NULL),
  -- V9500007: a second page_view with no ga_session_id.
  ('20251203', TIMESTAMPTZ '2025-12-03 16:45:00.001300+00', 'first_visit', TIMESTAMPTZ '2025-12-03 16:45:00+00', 1, '/features', '1', NULL, NULL, NULL, NULL, 'V9500007', '(organic)', 'organic', 'google', 'desktop', 'Belgium', NULL, NULL),
  ('20251203', TIMESTAMPTZ '2025-12-03 16:45:00.001300+00', 'session_start', TIMESTAMPTZ '2025-12-03 16:45:00+00', 1, '/features', '1', NULL, NULL, NULL, NULL, 'V9500007', '(organic)', 'organic', 'google', 'desktop', 'Belgium', NULL, NULL),
  ('20251203', TIMESTAMPTZ '2025-12-03 16:45:00.001300+00', 'page_view', TIMESTAMPTZ '2025-12-03 16:45:00+00', 1, '/features', '1', 25000, NULL, NULL, NULL, 'V9500007', '(organic)', 'organic', 'google', 'desktop', 'Belgium', NULL, NULL),
  ('20251203', TIMESTAMPTZ '2025-12-03 16:45:25.001400+00', 'page_view', NULL, 1, '/pricing', '1', 12000, NULL, NULL, NULL, 'V9500007', '(organic)', 'organic', 'google', 'desktop', 'Belgium', NULL, NULL),
  ('20251203', TIMESTAMPTZ '2025-12-03 16:50:00.002200+00', 'sign_up', TIMESTAMPTZ '2025-12-03 16:45:00+00', 1, '/signup', '1', NULL, NULL, NULL, '3', 'V9500007', '(organic)', 'organic', 'google', 'desktop', 'Belgium', NULL, NULL),
  -- V9500008: a second page_view with no user_pseudo_id, then one whose page_location has a query string.
  ('20251209', TIMESTAMPTZ '2025-12-09 08:10:00.001500+00', 'first_visit', TIMESTAMPTZ '2025-12-09 08:10:00+00', 1, '/lp/b2b-email', '1', NULL, NULL, NULL, NULL, 'V9500008', 'li_marketing_managers_2025', 'paid_social', 'linkedin', 'desktop', 'Netherlands', NULL, NULL),
  ('20251209', TIMESTAMPTZ '2025-12-09 08:10:00.001500+00', 'session_start', TIMESTAMPTZ '2025-12-09 08:10:00+00', 1, '/lp/b2b-email', '1', NULL, NULL, NULL, NULL, 'V9500008', 'li_marketing_managers_2025', 'paid_social', 'linkedin', 'desktop', 'Netherlands', NULL, NULL),
  ('20251209', TIMESTAMPTZ '2025-12-09 08:10:00.001500+00', 'page_view', TIMESTAMPTZ '2025-12-09 08:10:00+00', 1, '/lp/b2b-email', '1', 70000, NULL, NULL, NULL, 'V9500008', 'li_marketing_managers_2025', 'paid_social', 'linkedin', 'desktop', 'Netherlands', NULL, NULL),
  ('20251209', TIMESTAMPTZ '2025-12-09 08:11:10.001600+00', 'page_view', TIMESTAMPTZ '2025-12-09 08:10:00+00', 1, '/features/automation', '1', 50000, NULL, NULL, NULL, NULL, 'li_marketing_managers_2025', 'paid_social', 'linkedin', 'desktop', 'Netherlands', NULL, NULL),
  ('20251209', TIMESTAMPTZ '2025-12-09 08:12:00.001700+00', 'page_view', TIMESTAMPTZ '2025-12-09 08:10:00+00', 1, '/pricing?utm_source=newsletter&utm_medium=email', '1', 30000, NULL, NULL, NULL, 'V9500008', 'li_marketing_managers_2025', 'paid_social', 'linkedin', 'desktop', 'Netherlands', NULL, NULL),
  -- V9500001 comes back: its second session, with no first_visit.
  ('20251215', TIMESTAMPTZ '2025-12-15 12:00:00.001800+00', 'session_start', TIMESTAMPTZ '2025-12-15 12:00:00+00', 2, '/', '0', NULL, NULL, NULL, NULL, 'V9500001', '(organic)', 'organic', 'google', 'desktop', 'Ireland', NULL, NULL),
  ('20251215', TIMESTAMPTZ '2025-12-15 12:00:00.001800+00', 'page_view', TIMESTAMPTZ '2025-12-15 12:00:00+00', 2, '/', '0', 3000, NULL, NULL, NULL, 'V9500001', '(organic)', 'organic', 'google', 'desktop', 'Ireland', NULL, NULL),
  -- The two first payments, from the billing server with no session: user 1's value in double_value, user 2's in int_value.
  ('20251127', TIMESTAMPTZ '2025-11-27 03:00:00.001900+00', 'purchase', NULL, NULL, NULL, NULL, NULL, 45.0, NULL, '1', 'V9500002', 'nb_email_marketing_software_2025', 'cpc', 'google', NULL, 'Netherlands', '1', 45.0),
  ('20251202', TIMESTAMPTZ '2025-12-02 03:00:00.002000+00', 'purchase', NULL, NULL, NULL, NULL, NULL, NULL, 15, '2', 'V9500003', 'meta_prospecting_coaches_2025', 'paid_social', 'facebook', NULL, 'Germany', '2', 15.0),
  -- S9-C29: user 3's first payment, refunded later; its purchase is there all the same.
  ('20251210', TIMESTAMPTZ '2025-12-10 03:00:00.002100+00', 'purchase', NULL, NULL, NULL, NULL, NULL, 120.0, NULL, '3', 'V9500007', '(organic)', 'organic', 'google', NULL, 'Belgium', '4', 120.0)
) v(event_date, event_at, event_name, session_at, session_number, path, engaged, msec, value_double, value_int, user_id, user_pseudo_id,
    ts_name, ts_medium, ts_source, device, country, txn, revenue);

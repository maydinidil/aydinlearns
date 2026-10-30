-- pipeline/edge/maven_toy_store_edge.sql (sprint 8 Part 2, S8-16; Task D1)
-- The hidden edge data for items on Maven Toy Store (DS-MKT-03, schema maven_toy_store): our own invented rows, never the
-- dataset's, under the prepared tables' names and with their columns and types (pipeline/datasets/maven_toy_store.py). The traffic
-- source codes (gsearch, bsearch, socialbook) and the page paths are the kind the dataset uses, so a query by channel reads them the
-- same way; every product name and every row is ours. It holds no view and reads no other schema, so it is built whether or not
-- the dataset is prepared. The rows sit inside the registry questions' windows: most sessions in 2013 (DS-MKT-03-Q1), one in the
-- 90 days before the second product went on sale on 6 January 2013 (Q4), and a few from January to March 2014 (Q5, Q6). As in the
-- source, each product's created_at comes before its first sale. Planted:
--   sessions with a missing UTM source, campaign and content and no referring site: visitors who typed the address (sessions 4 and
--   9, in March and October 2013; session 4 places an order);
--   a session with a missing UTM source that came from a search engine's site: an unpaid search visit (session 5, March 2013);
--   a session with two orders (session 6, June 2013, orders 4 and 5), and sessions with no order (3, 5, 8, 9 and 13);
--   a session that started at 23:55 on 31 July 2013 whose order came at 00:05 on 1 August 2013 (session 7, order 6);
--   a session that started at 23:59 on 31 December 2013 whose order came at 00:10 on 1 January 2014 (session 10, order 7);
--   orders with two items: a primary product and one more (orders 3 and 8);
--   refunded order items, one in March 2013 and one in March 2014;
--   visitors with a repeat session (user 101: sessions 2 and 6; user 103: sessions 4 and 9).
-- Each order's price, cost and item count match its items, and each order has one thank-you page view in its session.
CREATE SCHEMA maven_toy_store_edge;
CREATE TABLE maven_toy_store_edge.website_sessions (
  website_session_id INTEGER,
  created_at TIMESTAMP,
  user_id INTEGER,
  is_repeat_session INTEGER,
  utm_source VARCHAR,
  utm_campaign VARCHAR,
  utm_content VARCHAR,
  device_type VARCHAR,
  http_referer VARCHAR
);
CREATE TABLE maven_toy_store_edge.website_pageviews (
  website_pageview_id INTEGER,
  created_at TIMESTAMP,
  website_session_id INTEGER,
  pageview_url VARCHAR
);
CREATE TABLE maven_toy_store_edge.orders (
  order_id INTEGER,
  created_at TIMESTAMP,
  website_session_id INTEGER,
  user_id INTEGER,
  primary_product_id INTEGER,
  items_purchased INTEGER,
  price_usd DOUBLE,
  cogs_usd DOUBLE
);
CREATE TABLE maven_toy_store_edge.order_items (
  order_item_id INTEGER,
  created_at TIMESTAMP,
  order_id INTEGER,
  product_id INTEGER,
  is_primary_item INTEGER,
  price_usd DOUBLE,
  cogs_usd DOUBLE
);
CREATE TABLE maven_toy_store_edge.order_item_refunds (
  order_item_refund_id INTEGER,
  created_at TIMESTAMP,
  order_item_id INTEGER,
  order_id INTEGER,
  refund_amount_usd DOUBLE
);
CREATE TABLE maven_toy_store_edge.products (
  product_id INTEGER,
  created_at TIMESTAMP,
  product_name VARCHAR
);
INSERT INTO maven_toy_store_edge.website_sessions VALUES
  (1, TIMESTAMP '2012-12-10 10:00:00', 100, 0, 'gsearch', 'nonbrand', 'g_ad_1', 'desktop', 'https://www.gsearch.com'),
  (2, TIMESTAMP '2013-03-04 09:00:00', 101, 0, 'gsearch', 'nonbrand', 'g_ad_1', 'desktop', 'https://www.gsearch.com'),
  (3, TIMESTAMP '2013-03-04 10:30:00', 102, 0, 'bsearch', 'brand', 'b_ad_2', 'mobile', 'https://www.bsearch.com'),
  (4, TIMESTAMP '2013-03-05 08:15:00', 103, 0, NULL, NULL, NULL, 'desktop', NULL),
  (5, TIMESTAMP '2013-03-05 12:00:00', 104, 0, NULL, NULL, NULL, 'mobile', 'https://www.gsearch.com'),
  (6, TIMESTAMP '2013-06-17 18:45:00', 101, 1, 'gsearch', 'nonbrand', 'g_ad_1', 'desktop', 'https://www.gsearch.com'),
  (7, TIMESTAMP '2013-07-31 23:55:00', 105, 0, 'gsearch', 'nonbrand', 'g_ad_2', 'mobile', 'https://www.gsearch.com'),
  (8, TIMESTAMP '2013-09-03 14:20:00', 106, 0, 'gsearch', 'brand', 'g_ad_3', 'desktop', 'https://www.gsearch.com'),
  (9, TIMESTAMP '2013-10-10 16:40:00', 103, 1, NULL, NULL, NULL, 'desktop', NULL),
  (10, TIMESTAMP '2013-12-31 23:59:00', 107, 0, 'socialbook', 'pilot', 'social_ad_1', 'mobile', 'https://www.socialbook.com'),
  (11, TIMESTAMP '2014-02-10 10:00:00', 108, 0, 'gsearch', 'nonbrand', 'g_ad_1', 'desktop', 'https://www.gsearch.com'),
  (12, TIMESTAMP '2014-03-03 11:00:00', 109, 0, 'bsearch', 'nonbrand', 'b_ad_1', 'mobile', 'https://www.bsearch.com'),
  (13, TIMESTAMP '2014-03-20 15:00:00', 110, 0, 'gsearch', 'nonbrand', 'g_ad_1', 'mobile', 'https://www.gsearch.com');
INSERT INTO maven_toy_store_edge.website_pageviews VALUES
  (1, TIMESTAMP '2012-12-10 10:00:00', 1, '/home'),
  (2, TIMESTAMP '2012-12-10 10:20:00', 1, '/thank-you-for-your-order'),
  (3, TIMESTAMP '2013-03-04 09:00:00', 2, '/home'),
  (4, TIMESTAMP '2013-03-04 09:05:00', 2, '/products'),
  (5, TIMESTAMP '2013-03-04 09:12:00', 2, '/thank-you-for-your-order'),
  (6, TIMESTAMP '2013-03-04 10:30:00', 3, '/lander-1'),
  (7, TIMESTAMP '2013-03-05 08:15:00', 4, '/home'),
  (8, TIMESTAMP '2013-03-05 08:40:00', 4, '/thank-you-for-your-order'),
  (9, TIMESTAMP '2013-03-05 12:00:00', 5, '/home'),
  (10, TIMESTAMP '2013-06-17 18:45:00', 6, '/products'),
  (11, TIMESTAMP '2013-06-17 19:05:00', 6, '/thank-you-for-your-order'),
  (12, TIMESTAMP '2013-06-17 19:30:00', 6, '/thank-you-for-your-order'),
  (13, TIMESTAMP '2013-07-31 23:55:00', 7, '/lander-2'),
  (14, TIMESTAMP '2013-08-01 00:05:00', 7, '/thank-you-for-your-order'),
  (15, TIMESTAMP '2013-09-03 14:20:00', 8, '/home'),
  (16, TIMESTAMP '2013-10-10 16:40:00', 9, '/home'),
  (17, TIMESTAMP '2013-12-31 23:59:00', 10, '/lander-2'),
  (18, TIMESTAMP '2014-01-01 00:10:00', 10, '/thank-you-for-your-order'),
  (19, TIMESTAMP '2014-02-10 10:00:00', 11, '/home'),
  (20, TIMESTAMP '2014-02-10 10:10:00', 11, '/cart'),
  (21, TIMESTAMP '2014-02-10 10:25:00', 11, '/thank-you-for-your-order'),
  (22, TIMESTAMP '2014-03-03 11:00:00', 12, '/lander-1'),
  (23, TIMESTAMP '2014-03-03 11:20:00', 12, '/thank-you-for-your-order'),
  (24, TIMESTAMP '2014-03-20 15:00:00', 13, '/home');
INSERT INTO maven_toy_store_edge.orders VALUES
  (1, TIMESTAMP '2012-12-10 10:20:00', 1, 100, 1, 1, 49.99, 19.49),
  (2, TIMESTAMP '2013-03-04 09:12:00', 2, 101, 1, 1, 49.99, 19.49),
  (3, TIMESTAMP '2013-03-05 08:40:00', 4, 103, 2, 2, 109.98, 41.98),
  (4, TIMESTAMP '2013-06-17 19:05:00', 6, 101, 1, 1, 49.99, 19.49),
  (5, TIMESTAMP '2013-06-17 19:30:00', 6, 101, 2, 1, 59.99, 22.49),
  (6, TIMESTAMP '2013-08-01 00:05:00', 7, 105, 1, 1, 49.99, 19.49),
  (7, TIMESTAMP '2014-01-01 00:10:00', 10, 107, 2, 1, 59.99, 22.49),
  (8, TIMESTAMP '2014-02-10 10:25:00', 11, 108, 3, 2, 75.98, 23.98),
  (9, TIMESTAMP '2014-03-03 11:20:00', 12, 109, 4, 1, 29.99, 9.49);
INSERT INTO maven_toy_store_edge.order_items VALUES
  (1, TIMESTAMP '2012-12-10 10:20:00', 1, 1, 1, 49.99, 19.49),
  (2, TIMESTAMP '2013-03-04 09:12:00', 2, 1, 1, 49.99, 19.49),
  (3, TIMESTAMP '2013-03-05 08:40:00', 3, 2, 1, 59.99, 22.49),
  (4, TIMESTAMP '2013-03-05 08:40:00', 3, 1, 0, 49.99, 19.49),
  (5, TIMESTAMP '2013-06-17 19:05:00', 4, 1, 1, 49.99, 19.49),
  (6, TIMESTAMP '2013-06-17 19:30:00', 5, 2, 1, 59.99, 22.49),
  (7, TIMESTAMP '2013-08-01 00:05:00', 6, 1, 1, 49.99, 19.49),
  (8, TIMESTAMP '2014-01-01 00:10:00', 7, 2, 1, 59.99, 22.49),
  (9, TIMESTAMP '2014-02-10 10:25:00', 8, 3, 1, 45.99, 14.49),
  (10, TIMESTAMP '2014-02-10 10:25:00', 8, 4, 0, 29.99, 9.49),
  (11, TIMESTAMP '2014-03-03 11:20:00', 9, 4, 1, 29.99, 9.49);
INSERT INTO maven_toy_store_edge.order_item_refunds VALUES
  (1, TIMESTAMP '2013-03-14 10:00:00', 2, 2, 49.99),
  (2, TIMESTAMP '2014-03-12 09:00:00', 11, 9, 29.99);
INSERT INTO maven_toy_store_edge.products VALUES
  (1, TIMESTAMP '2012-03-19 09:00:00', 'The Edge Classic Bear'),
  (2, TIMESTAMP '2013-01-06 13:00:00', 'The Edge Love Bear'),
  (3, TIMESTAMP '2013-12-12 09:00:00', 'The Edge Party Panda'),
  (4, TIMESTAMP '2014-02-05 10:00:00', 'The Edge Mini Bear');

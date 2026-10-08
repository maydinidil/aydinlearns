-- pipeline/edge/voltmarkt_edge_set.sql (family: SQL-SET-01)
-- Sprint 4a (S4-03): the level 3 set-operation cases, with every voltmarkt table name; the build adds the sales
-- view (pipeline/voltmarkt/ddl.sql). Planted, for inputs split by channel, month or promotion:
--   rows in both inputs: products 1 and 2 sell on the web and in a store, customer 2001 orders in both
--   channels, product 2 is in promotions 1 and 2;
--   duplicates inside one input: product 1 is on three web lines and product 2 on two, customer 2001 has two
--   web orders, Bliksem prices product 1 at 11.99 twice;
--   missing values in compared columns: a guest order (customer_id missing) in each channel, so the web and
--   store customer lists both hold a missing value; most lines have no promotion (promo_id missing);
--   one-sided rows: customer 2002 orders only on the web and 2003 and 2004 only in a store; product 5 is on
--   promotion but never sold; product 4 sells only in a store;
--   both rivals price product 2 at 79.99, and Stroomhuis prices product 1 at Voltmarkt's list price.
-- Sprint 4c (Task A1): promotion 3 (P-2025-11, 14 to 27 April 2025) covers product 4, and no order line carries it,
-- so CASE-VOLT-L3's CP3 (EX-OPENER-L3-01) keeps a 2025 promotion with no lines at 0; product 4 sells only in May.
-- Line prices follow E-103: the list price on the order date, less the promotion's discount (half up).
CREATE SCHEMA voltmarkt_edge_set;
CREATE TABLE voltmarkt_edge_set.calendar AS SELECT * FROM voltmarkt.calendar WHERE cal_date IN (
  DATE '2025-05-05', DATE '2025-05-06', DATE '2025-05-07', DATE '2025-05-12', DATE '2025-05-13', DATE '2025-05-14',
  DATE '2025-05-17', DATE '2025-05-20', DATE '2025-05-21', DATE '2025-05-24', DATE '2025-05-26', DATE '2025-05-31',
  DATE '2025-06-02');
CREATE TABLE voltmarkt_edge_set.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_set.stores VALUES
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL),
  (15, 'BE-01', 'Brussel', 'BE', 'flagship', 'Europe/Brussels', DATE '2014-09-01', NULL),
  (99, 'WEB-01', 'Online', 'NL', 'web', 'UTC', DATE '2015-01-01', NULL);
CREATE TABLE voltmarkt_edge_set.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_set.categories VALUES
  (2, 'TVs 50-55 inch', 'TV & Video'),
  (15, 'Headphones', 'Audio'),
  (16, 'Earbuds', 'Audio'),
  (35, 'Cables', 'Accessories');
CREATE TABLE voltmarkt_edge_set.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_set.products VALUES
  (1, 'VM-000001', 'Cablemate One 200', 'Cablemate', 35, 'Cables', NULL, 5.00, DATE '2022-06-01'),
  (2, 'VM-000002', 'Sonora Air 120', 'Sonora', 16, 'Earbuds', NULL, 47.00, DATE '2023-02-01'),
  (3, 'VM-000003', 'Vistara Pro 550', 'Vistara', 2, 'TVs 50-55 inch', NULL, 640.00, DATE '2023-04-03'),
  (4, 'VM-000004', 'Basswell Pro 410', 'Basswell', 15, 'Headphones', NULL, 70.00, DATE '2023-05-01'),
  (5, 'VM-000005', 'Sonora Neo 140', 'Sonora', 16, 'Earbuds', NULL, 30.00, DATE '2024-03-01');
CREATE TABLE voltmarkt_edge_set.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_set.promotions VALUES
  (1, 'P-2025-14', 'May Audio Days', 'percent_off', DATE '2025-05-12', DATE '2025-05-25', 20.00),
  (2, 'P-2025-16', 'June Deals', 'percent_off', DATE '2025-06-02', DATE '2025-06-15', 10.00),
  (3, 'P-2025-11', 'April Headphone Days', 'percent_off', DATE '2025-04-14', DATE '2025-04-27', 15.00);
CREATE TABLE voltmarkt_edge_set.promotion_products AS SELECT * FROM voltmarkt.promotion_products LIMIT 0;
INSERT INTO voltmarkt_edge_set.promotion_products VALUES (1, 2), (1, 5), (2, 2), (2, 3), (3, 4);
CREATE TABLE voltmarkt_edge_set.price_history AS SELECT * FROM voltmarkt.price_history LIMIT 0;
INSERT INTO voltmarkt_edge_set.price_history VALUES
  (1, DATE '2022-06-01', NULL, 12.99),
  (2, DATE '2023-02-01', DATE '2025-05-31', 86.00),
  (2, DATE '2025-06-01', NULL, 79.00),
  (3, DATE '2023-04-03', NULL, 899.00),
  (4, DATE '2023-05-01', NULL, 129.00),
  (5, DATE '2024-03-01', NULL, 54.00);
CREATE TABLE voltmarkt_edge_set.orders AS SELECT * FROM voltmarkt.orders LIMIT 0;
INSERT INTO voltmarkt_edge_set.orders VALUES
  (1, 2001, 99, TIMESTAMP '2025-05-05 10:00:00', 'web', 'NL'),
  (2, 2001, 99, TIMESTAMP '2025-05-12 19:30:00', 'web', 'NL'),
  (3, 2001, 1, TIMESTAMP '2025-05-17 14:00:00', 'store', 'NL'),
  (4, 2002, 99, TIMESTAMP '2025-05-20 21:10:00', 'web', 'BE'),
  (5, 2003, 15, TIMESTAMP '2025-05-24 11:30:00', 'store', 'BE'),
  (6, NULL, 99, TIMESTAMP '2025-05-26 08:45:00', 'web', 'LU'),
  (7, NULL, 1, TIMESTAMP '2025-05-31 16:20:00', 'store', 'NL'),
  (8, 2004, 15, TIMESTAMP '2025-06-02 12:00:00', 'store', 'BE');
CREATE TABLE voltmarkt_edge_set.order_lines AS SELECT * FROM voltmarkt.order_lines LIMIT 0;
INSERT INTO voltmarkt_edge_set.order_lines VALUES
  (1, 1, 1, 2, 12.99, NULL, 0.00),
  (2, 2, 1, 1, 12.99, NULL, 0.00),
  (3, 2, 2, 1, 86.00, 1, 17.20),
  (4, 3, 1, 3, 12.99, NULL, 0.00),
  (5, 4, 2, 1, 86.00, 1, 17.20),
  (6, 5, 3, 1, 899.00, NULL, 0.00),
  (7, 6, 1, 1, 12.99, NULL, 0.00),
  (8, 7, 4, 1, 129.00, NULL, 0.00),
  (9, 8, 2, 1, 79.00, 2, 7.90),
  (10, 8, 3, 1, 899.00, 2, 89.90);
CREATE TABLE voltmarkt_edge_set.competitor_prices AS SELECT * FROM voltmarkt.competitor_prices LIMIT 0;
INSERT INTO voltmarkt_edge_set.competitor_prices VALUES
  (1, 'Bliksem', TIMESTAMP '2025-05-06 06:00:00', 11.99),
  (1, 'Bliksem', TIMESTAMP '2025-05-13 06:05:00', 11.99),
  (1, 'Stroomhuis', TIMESTAMP '2025-05-07 07:00:00', 12.99),
  (2, 'Bliksem', TIMESTAMP '2025-05-13 06:30:00', 79.99),
  (2, 'Stroomhuis', TIMESTAMP '2025-05-14 07:10:00', 79.99),
  (4, 'Stroomhuis', TIMESTAMP '2025-05-21 07:40:00', 124.99);

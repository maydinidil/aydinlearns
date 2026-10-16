-- pipeline/edge/voltmarkt_edge_subq.sql (family: SQL-SUBQ-01, SQL-SUBQ-02; ERR-SEM-05, ERR-LOG-07, ERR-LOG-20, ERR-LOG-30,
-- ERR-LOG-31)
-- Sprint 6 (S6-04): the level 4 subquery cases, with every voltmarkt table name; the build adds the sales and weekly
-- competitor price views. Planted:
--   a missing value in a column NOT IN reads: most order lines have no promotion (promo_id missing), so "promotions no line
--   carried" with NOT IN finds none, while NOT EXISTS finds promotions 2 and 3; orders 2 and 6 are guest orders (customer_id
--   missing), so "test customers with no order" with NOT IN finds none;
--   categories with one product: Soundbars (17) and Cables (35);
--   two products tied at a category's top price: products 1 and 2 both list at 899.00 now (TVs 50-55 inch, category 2),
--   beside product 3 at 599.00; both sold at 899.00, and product 1's earlier price was lower;
--   customers with no orders: A/B test customers 2005 and 2006;
--   correlated groups with no rows: category 36 (Batteries) has no products, product 6 never sold, store BE-14 (22) has no
--   orders;
--   products with two price versions (1 and 5), so a scalar subquery over price_history without a date returns two rows;
--   groups of different sizes (lines per category and per store), so an average of group averages is not the overall one.
-- Line prices follow E-103: the list price on the order date, less the promotion's discount (half up).
CREATE SCHEMA voltmarkt_edge_subq;
CREATE TABLE voltmarkt_edge_subq.calendar AS SELECT * FROM voltmarkt.calendar
  WHERE cal_date BETWEEN DATE '2025-05-05' AND DATE '2025-05-11';
CREATE TABLE voltmarkt_edge_subq.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_subq.stores VALUES
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL),
  (4, 'NL-04', 'Utrecht', 'NL', 'standard', 'Europe/Amsterdam', DATE '2011-09-01', NULL),
  (15, 'BE-01', 'Brussel', 'BE', 'flagship', 'Europe/Brussels', DATE '2014-09-01', NULL),
  (22, 'BE-14', 'Antwerpen', 'BE', 'standard', 'Europe/Brussels', DATE '2013-11-01', NULL),
  (99, 'WEB-01', 'Online', 'NL', 'web', 'UTC', DATE '2015-01-01', NULL);
CREATE TABLE voltmarkt_edge_subq.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_subq.categories VALUES
  (2, 'TVs 50-55 inch', 'TV & Video'),
  (16, 'Earbuds', 'Audio'),
  (17, 'Soundbars', 'Audio'),
  (35, 'Cables', 'Accessories'),
  (36, 'Batteries', 'Accessories');
CREATE TABLE voltmarkt_edge_subq.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_subq.products VALUES
  (1, 'VM-000001', 'Vistara Pro 550', 'Vistara', 2, 'TVs 50-55 inch', NULL, 640.00, DATE '2023-04-03'),
  (2, 'VM-000002', 'Lumio Max 552', 'Lumio', 2, 'TVs 50-55 inch', NULL, 610.00, DATE '2023-08-14'),
  (3, 'VM-000003', 'Nordvue One 500', 'Nordvue', 2, 'TVs 50-55 inch', NULL, 420.00, DATE '2022-02-01'),
  (4, 'VM-000004', 'Sonora Pro 311', 'Sonora', 16, 'Earbuds', 5, 99.00, DATE '2023-09-18'),
  (5, 'VM-000005', 'Sonora Lite 312', 'Sonora', 16, 'Earbuds', 4, 39.00, DATE '2022-03-14'),
  (6, 'VM-000006', 'Basswell Air 140', 'Basswell', 16, 'Earbuds', NULL, 45.00, DATE '2024-01-15'),
  (7, 'VM-000007', 'Echoline Neo 420', 'Echoline', 17, 'Soundbars', NULL, 180.00, DATE '2022-05-10'),
  (8, 'VM-000008', 'Cablemate One 200', 'Cablemate', 35, 'Cables', NULL, 5.00, DATE '2022-06-01');
CREATE TABLE voltmarkt_edge_subq.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_subq.promotions VALUES
  (1, 'P-2025-14', 'May Audio Deals', 'percent_off', DATE '2025-05-05', DATE '2025-05-18', 20.00),
  (2, 'P-2025-15', 'May TV Days', 'percent_off', DATE '2025-05-12', DATE '2025-05-25', 10.00),
  (3, 'P-2025-16', 'June Cable Clearance', 'clearance', DATE '2025-06-02', DATE '2025-06-15', 30.00);
CREATE TABLE voltmarkt_edge_subq.promotion_products AS SELECT * FROM voltmarkt.promotion_products LIMIT 0;
INSERT INTO voltmarkt_edge_subq.promotion_products VALUES (1, 4), (1, 7), (2, 3), (3, 8);
CREATE TABLE voltmarkt_edge_subq.price_history AS SELECT * FROM voltmarkt.price_history LIMIT 0;
INSERT INTO voltmarkt_edge_subq.price_history VALUES
  (1, DATE '2023-04-03', DATE '2025-04-30', 849.00),
  (1, DATE '2025-05-01', NULL, 899.00),
  (2, DATE '2023-08-14', NULL, 899.00),
  (3, DATE '2022-02-01', NULL, 599.00),
  (4, DATE '2023-09-18', NULL, 179.00),
  (5, DATE '2022-03-14', DATE '2025-04-27', 69.00),
  (5, DATE '2025-04-28', NULL, 64.99),
  (6, DATE '2024-01-15', NULL, 79.00),
  (7, DATE '2022-05-10', NULL, 299.00),
  (8, DATE '2022-06-01', NULL, 12.99);
CREATE TABLE voltmarkt_edge_subq.orders AS SELECT * FROM voltmarkt.orders LIMIT 0;
INSERT INTO voltmarkt_edge_subq.orders VALUES
  (1, 2001, 1, TIMESTAMP '2025-05-05 10:15:00', 'store', 'NL'),
  (2, NULL, 4, TIMESTAMP '2025-05-05 14:30:00', 'store', 'NL'),
  (3, 2002, 99, TIMESTAMP '2025-05-06 19:45:00', 'web', 'BE'),
  (4, 2001, 99, TIMESTAMP '2025-05-07 08:20:00', 'web', 'NL'),
  (5, 2003, 15, TIMESTAMP '2025-05-08 16:05:00', 'store', 'BE'),
  (6, NULL, 99, TIMESTAMP '2025-05-09 21:10:00', 'web', 'LU'),
  (7, 2002, 1, TIMESTAMP '2025-05-10 11:40:00', 'store', 'NL'),
  (8, 2004, 4, TIMESTAMP '2025-05-11 13:00:00', 'store', 'NL');
CREATE TABLE voltmarkt_edge_subq.order_lines AS SELECT * FROM voltmarkt.order_lines LIMIT 0;
INSERT INTO voltmarkt_edge_subq.order_lines VALUES
  (1, 1, 1, 1, 899.00, NULL, 0.00),
  (2, 1, 8, 2, 12.99, NULL, 0.00),
  (3, 2, 2, 1, 899.00, NULL, 0.00),
  (4, 2, 4, 1, 179.00, 1, 35.80),
  (5, 3, 4, 2, 179.00, 1, 71.60),
  (6, 3, 5, 1, 64.99, NULL, 0.00),
  (7, 4, 5, 3, 64.99, NULL, 0.00),
  (8, 5, 7, 1, 299.00, 1, 59.80),
  (9, 5, 3, 1, 599.00, NULL, 0.00),
  (10, 6, 4, 1, 179.00, 1, 35.80),
  (11, 7, 5, 1, 64.99, NULL, 0.00),
  (12, 7, 8, 4, 12.99, NULL, 0.00),
  (13, 8, 1, 1, 899.00, NULL, 0.00),
  (14, 8, 4, 1, 179.00, 1, 35.80);
CREATE TABLE voltmarkt_edge_subq.competitor_prices AS SELECT * FROM voltmarkt.competitor_prices LIMIT 0;
INSERT INTO voltmarkt_edge_subq.competitor_prices VALUES
  (1, 'Bliksem', TIMESTAMP '2025-05-06 06:10:00', 879.99),
  (2, 'Stroomhuis', TIMESTAMP '2025-05-07 07:20:00', 919.99),
  (4, 'Bliksem', TIMESTAMP '2025-05-06 06:30:00', 169.99);
CREATE TABLE voltmarkt_edge_subq.ab_assignments AS SELECT * FROM voltmarkt.ab_assignments LIMIT 0;
INSERT INTO voltmarkt_edge_subq.ab_assignments VALUES
  ('AB-2025-01', 2001, 'control', TIMESTAMP '2025-09-01 10:00:00'),
  ('AB-2025-01', 2002, 'treatment', TIMESTAMP '2025-09-02 11:00:00'),
  ('AB-2025-01', 2005, 'control', TIMESTAMP '2025-09-03 12:00:00'),
  ('AB-2025-01', 2006, 'treatment', TIMESTAMP '2025-09-04 13:00:00');
CREATE TABLE voltmarkt_edge_subq.ab_conversions AS SELECT * FROM voltmarkt.ab_conversions LIMIT 0;
INSERT INTO voltmarkt_edge_subq.ab_conversions VALUES
  ('AB-2025-01', 2002, TIMESTAMP '2025-09-02 11:20:00', 64.99);
-- Costs follow voltmarkt's rule (S6-07): the Audio products' cost rises 8% from 2025-07-01, the others keep theirs.
CREATE TABLE voltmarkt_edge_subq.cost_history AS SELECT * FROM voltmarkt.cost_history LIMIT 0;
INSERT INTO voltmarkt_edge_subq.cost_history VALUES
  (1, DATE '2023-04-03', NULL, 640.00),
  (2, DATE '2023-08-14', NULL, 610.00),
  (3, DATE '2022-02-01', NULL, 420.00),
  (4, DATE '2023-09-18', DATE '2025-06-30', 99.00),
  (4, DATE '2025-07-01', NULL, 106.92),
  (5, DATE '2022-03-14', DATE '2025-06-30', 39.00),
  (5, DATE '2025-07-01', NULL, 42.12),
  (6, DATE '2024-01-15', DATE '2025-06-30', 45.00),
  (6, DATE '2025-07-01', NULL, 48.60),
  (7, DATE '2022-05-10', DATE '2025-06-30', 180.00),
  (7, DATE '2025-07-01', NULL, 194.40),
  (8, DATE '2022-06-01', NULL, 5.00);
-- M5 (D90, S6-36): added after the sprint 6 build, so every row above stays as it was. The orders now spread from November 2024
-- to September 2025 (they all fell in May 2025), so the items that look outside May have rows here too. Planted:
--   store LU-02 (25): customer 2007 orders there on 31 December 2024 and never again, customer 2003 there in November 2024 and
--   again in May 2025 at another store, and guests (customer_id missing) there in November 2024 and August 2025. The August
--   order makes LU-02 a fourth physical store with 2025 sales, so an average over stores, over all stores and over orders
--   each pick other stores;
--   two bulk guest orders on the web (customer_id missing), in February and August 2025: Cablemate One 200 (8) reaches 2,001
--   units in all and Sonora Lite 312 (5) exactly 2,000, which "more than 2,000" leaves out; no single line reaches 2,000. Being
--   guest web orders, they leave every physical store's and every registered customer's totals as they were;
--   A/B test customer 2008 converts on a web order and has no store order, beside 2002, who converted and also ordered in a store;
--   none of the new lines is on promotion, product 6 still never sells, and store BE-14 (22) still has no orders.
-- The calendar gains voltmarkt's row for each day of each promotion above that it lacked, and each new order's UTC day.
INSERT INTO voltmarkt_edge_subq.stores VALUES
  (25, 'LU-02', 'Esch-sur-Alzette', 'LU', 'standard', 'Europe/Luxembourg', DATE '2022-05-01', NULL);
INSERT INTO voltmarkt_edge_subq.orders VALUES
  (9, 2003, 25, TIMESTAMP '2024-11-16 10:30:00', 'store', 'LU'),
  (10, NULL, 25, TIMESTAMP '2024-11-16 15:05:00', 'store', 'LU'),
  (11, 2007, 25, TIMESTAMP '2024-12-31 15:20:00', 'store', 'LU'),
  (12, NULL, 99, TIMESTAMP '2025-02-14 09:45:00', 'web', 'NL'),
  (13, NULL, 99, TIMESTAMP '2025-08-22 10:15:00', 'web', 'BE'),
  (14, 2008, 99, TIMESTAMP '2025-09-05 09:40:00', 'web', 'NL'),
  (15, NULL, 25, TIMESTAMP '2025-08-22 13:40:00', 'store', 'LU');
INSERT INTO voltmarkt_edge_subq.order_lines VALUES
  (15, 9, 7, 1, 299.00, NULL, 0.00),
  (16, 10, 8, 3, 12.99, NULL, 0.00),
  (17, 11, 5, 1, 69.00, NULL, 0.00),
  (18, 12, 8, 1000, 12.99, NULL, 0.00),
  (19, 12, 5, 1000, 69.00, NULL, 0.00),
  (20, 13, 8, 990, 12.99, NULL, 0.00),
  (21, 13, 5, 994, 64.99, NULL, 0.00),
  (22, 14, 8, 2, 12.99, NULL, 0.00),
  (23, 15, 7, 1, 299.00, NULL, 0.00);
INSERT INTO voltmarkt_edge_subq.ab_assignments VALUES
  ('AB-2025-01', 2008, 'treatment', TIMESTAMP '2025-09-05 09:12:00');
INSERT INTO voltmarkt_edge_subq.ab_conversions VALUES
  ('AB-2025-01', 2008, TIMESTAMP '2025-09-05 09:40:00', 25.98);
INSERT INTO voltmarkt_edge_subq.calendar SELECT c.* FROM voltmarkt.calendar AS c
WHERE (EXISTS (SELECT 1 FROM voltmarkt_edge_subq.promotions AS p WHERE c.cal_date BETWEEN p.start_date AND p.end_date)
       OR EXISTS (SELECT 1 FROM voltmarkt_edge_subq.orders AS o WHERE CAST(o.order_ts AS DATE) = c.cal_date))
  AND NOT EXISTS (SELECT 1 FROM voltmarkt_edge_subq.calendar AS e WHERE e.cal_date = c.cal_date)
ORDER BY c.cal_date;

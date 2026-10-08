-- pipeline/edge/voltmarkt_edge_join.sql (family: SQL-JOIN-01 to SQL-JOIN-05, SQL-CTE-01; ERR-LOG-01, ERR-LOG-10,
-- ERR-LOG-11, ERR-LOG-12, ERR-SEM-03, ERR-SYN-03)
-- Sprint 4a (S4-03): the level 3 join cases, with every voltmarkt table name; the build adds the sales view
-- (pipeline/voltmarkt/ddl.sql). Planted:
--   order 5 has no lines; customers 1001 and 1002 have orders in two places; orders 3 and 6 are guest orders
--   (customer_id missing), each with lines;
--   line 9 carries promo_id 9, which has no row in promotions; most lines have no promotion (promo_id missing);
--   product 2 is in promotions 1 and 2 and sold during each, so a join on product_id alone repeats its lines;
--   product 1 has price versions starting on Monday 3 and Thursday 6 March 2025, with a sale at each price;
--   the current price of each product has no valid_to;
--   store BE-09 (opened 2025-03-01) has no orders; category 36 has no products; product 6 never sold;
--   products 2 and 3 are sisters;
--   product 1 has three competitor prices in the week of 3 March 2025, two from Bliksem; products 3 and 5
--   have none that week, and product 5 has none at all.
-- Sprint 4c (Task A1): ISO week 11 of 2025 (Monday 10 to Sunday 16 March, days in UTC), CASE-PRICE-02's promotion
-- week: orders 8 to 11 (lines 12 to 17), one on the Sunday; products 2 and 4 sell on promotion 2 and product 5 on
-- promotion 3; products 1 to 4 have competitor prices that week, product 5 has none, and the rivals check product 6,
-- which does not sell; in the earbuds category (16), products 2 and 3 sell at different ratios to the rivals' price
-- and in different units, so the average of the line ratios is not the unit-weighted index.
-- Line prices follow E-103: the list price on the order date, less the promotion's discount (half up).
CREATE SCHEMA voltmarkt_edge_join;
CREATE TABLE voltmarkt_edge_join.calendar AS SELECT * FROM voltmarkt.calendar
  WHERE cal_date BETWEEN DATE '2025-02-24' AND DATE '2025-03-16';
CREATE TABLE voltmarkt_edge_join.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_join.stores VALUES
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL),
  (4, 'NL-04', 'Utrecht', 'NL', 'standard', 'Europe/Amsterdam', DATE '2011-09-01', NULL),
  (15, 'BE-01', 'Brussel', 'BE', 'flagship', 'Europe/Brussels', DATE '2014-09-01', NULL),
  (19, 'BE-09', 'Mechelen', 'BE', 'standard', 'Europe/Brussels', DATE '2025-03-01', NULL),
  (99, 'WEB-01', 'Online', 'NL', 'web', 'UTC', DATE '2015-01-01', NULL);
CREATE TABLE voltmarkt_edge_join.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_join.categories VALUES
  (2, 'TVs 50-55 inch', 'TV & Video'),
  (16, 'Earbuds', 'Audio'),
  (17, 'Soundbars', 'Audio'),
  (21, 'Consoles', 'Gaming'),
  (35, 'Cables', 'Accessories'),
  (36, 'Batteries', 'Accessories');
CREATE TABLE voltmarkt_edge_join.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_join.products VALUES
  (1, 'VM-000001', 'Vistara Pro 550', 'Vistara', 2, 'TVs 50-55 inch', NULL, 640.00, DATE '2023-04-03'),
  (2, 'VM-000002', 'Sonora Pro 311', 'Sonora', 16, 'Earbuds', 3, 99.00, DATE '2023-09-18'),
  (3, 'VM-000003', 'Sonora Lite 312', 'Sonora', 16, 'Earbuds', 2, 39.00, DATE '2022-03-14'),
  (4, 'VM-000004', 'Basswell Neo 410', 'Basswell', 17, 'Soundbars', NULL, 180.00, DATE '2022-05-10'),
  (5, 'VM-000005', 'Cablemate One 200', 'Cablemate', 35, 'Cables', NULL, 5.00, DATE '2022-06-01'),
  (6, 'VM-000006', 'PlayBox 5', 'PlayBox', 21, 'Consoles', NULL, 415.00, DATE '2021-11-19');
CREATE TABLE voltmarkt_edge_join.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_join.promotions VALUES
  (1, 'P-2025-04', 'February Earbuds Days', 'percent_off', DATE '2025-02-17', DATE '2025-03-02', 15.00),
  (2, 'P-2025-05', 'March Audio Deals', 'percent_off', DATE '2025-03-03', DATE '2025-03-16', 20.00),
  (3, 'P-2025-06', 'March Cable Clearance', 'clearance', DATE '2025-03-03', DATE '2025-03-16', 30.00);
CREATE TABLE voltmarkt_edge_join.promotion_products AS SELECT * FROM voltmarkt.promotion_products LIMIT 0;
INSERT INTO voltmarkt_edge_join.promotion_products VALUES (1, 2), (2, 2), (2, 4), (3, 5);
CREATE TABLE voltmarkt_edge_join.price_history AS SELECT * FROM voltmarkt.price_history LIMIT 0;
INSERT INTO voltmarkt_edge_join.price_history VALUES
  (1, DATE '2023-04-03', DATE '2025-03-02', 899.00),
  (1, DATE '2025-03-03', DATE '2025-03-05', 849.00),
  (1, DATE '2025-03-06', NULL, 799.00),
  (2, DATE '2023-09-18', NULL, 179.00),
  (3, DATE '2022-03-14', DATE '2025-02-28', 69.00),
  (3, DATE '2025-03-01', NULL, 59.00),
  (4, DATE '2022-05-10', NULL, 299.00),
  (5, DATE '2022-06-01', NULL, 12.99),
  (6, DATE '2021-11-19', NULL, 499.00);
CREATE TABLE voltmarkt_edge_join.orders AS SELECT * FROM voltmarkt.orders LIMIT 0;
INSERT INTO voltmarkt_edge_join.orders VALUES
  (1, 1001, 1, TIMESTAMP '2025-02-28 14:10:00', 'store', 'NL'),
  (2, 1002, 99, TIMESTAMP '2025-03-03 09:15:00', 'web', 'BE'),
  (3, NULL, 15, TIMESTAMP '2025-03-04 16:40:00', 'store', 'BE'),
  (4, 1001, 4, TIMESTAMP '2025-03-06 11:00:00', 'store', 'NL'),
  (5, 1003, 99, TIMESTAMP '2025-03-07 20:30:00', 'web', 'NL'),
  (6, NULL, 99, TIMESTAMP '2025-03-08 12:05:00', 'web', 'LU'),
  (7, 1002, 1, TIMESTAMP '2025-03-09 15:20:00', 'store', 'NL'),
  (8, 1002, 99, TIMESTAMP '2025-03-10 08:20:00', 'web', 'BE'),
  (9, 1001, 1, TIMESTAMP '2025-03-12 13:05:00', 'store', 'NL'),
  (10, NULL, 15, TIMESTAMP '2025-03-14 17:30:00', 'store', 'BE'),
  (11, 1001, 4, TIMESTAMP '2025-03-16 11:45:00', 'store', 'NL');
CREATE TABLE voltmarkt_edge_join.order_lines AS SELECT * FROM voltmarkt.order_lines LIMIT 0;
INSERT INTO voltmarkt_edge_join.order_lines VALUES
  (1, 1, 2, 1, 179.00, 1, 26.85),
  (2, 1, 5, 2, 12.99, NULL, 0.00),
  (3, 2, 1, 1, 849.00, NULL, 0.00),
  (4, 2, 4, 1, 299.00, 2, 59.80),
  (5, 3, 2, 1, 179.00, 2, 35.80),
  (6, 3, 5, 3, 12.99, 3, 11.69),
  (7, 4, 1, 1, 799.00, NULL, 0.00),
  (8, 4, 4, 1, 299.00, 2, 59.80),
  (9, 6, 3, 1, 59.00, 9, 5.90),
  (10, 6, 5, 1, 12.99, 3, 3.90),
  (11, 7, 3, 2, 59.00, NULL, 0.00),
  (12, 8, 2, 2, 179.00, 2, 71.60),
  (13, 8, 5, 4, 12.99, 3, 15.59),
  (14, 9, 1, 1, 799.00, NULL, 0.00),
  (15, 9, 3, 3, 59.00, NULL, 0.00),
  (16, 10, 4, 1, 299.00, 2, 59.80),
  (17, 11, 2, 1, 179.00, 2, 35.80);
CREATE TABLE voltmarkt_edge_join.competitor_prices AS SELECT * FROM voltmarkt.competitor_prices LIMIT 0;
INSERT INTO voltmarkt_edge_join.competitor_prices VALUES
  (1, 'Bliksem', TIMESTAMP '2025-03-03 06:10:00', 819.99),
  (1, 'Stroomhuis', TIMESTAMP '2025-03-04 07:25:00', 869.99),
  (1, 'Bliksem', TIMESTAMP '2025-03-06 06:05:00', 779.99),
  (2, 'Bliksem', TIMESTAMP '2025-03-05 06:40:00', 169.99),
  (2, 'Stroomhuis', TIMESTAMP '2025-03-05 07:55:00', 183.99),
  (4, 'Stroomhuis', TIMESTAMP '2025-03-04 08:15:00', 309.99),
  (6, 'Bliksem', TIMESTAMP '2025-03-05 06:20:00', 479.99),
  (1, 'Bliksem', TIMESTAMP '2025-03-10 06:15:00', 769.99),
  (1, 'Stroomhuis', TIMESTAMP '2025-03-11 07:30:00', 789.99),
  (2, 'Bliksem', TIMESTAMP '2025-03-12 06:35:00', 164.99),
  (2, 'Stroomhuis', TIMESTAMP '2025-03-12 07:50:00', 172.99),
  (3, 'Stroomhuis', TIMESTAMP '2025-03-13 07:40:00', 54.99),
  (6, 'Bliksem', TIMESTAMP '2025-03-14 06:25:00', 474.99),
  (4, 'Bliksem', TIMESTAMP '2025-03-16 06:10:00', 304.99);

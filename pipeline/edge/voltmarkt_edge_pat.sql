-- pipeline/edge/voltmarkt_edge_pat.sql (family: SQL-PAT-01 to SQL-PAT-10; ERR-LOG-39, -40, -46, -48, -49, -01, -04 and the rest of E-209)
-- Sprint 8 (S8-07): the level 6 business-pattern cases on Voltmarkt, with every voltmarkt table name; the build adds the sales,
-- weekly competitor price and weekly_units views. Orders run from January 2024 to December 2025 and the calendar holds every day of
-- those two years. Planted (pipeline/tests/test_edge_pat.py holds each):
--   a tie at each top-N cutoff a prompt can name, over 2025 (1 January to 31 December):
--     products by revenue within category, highest first: TVs 50-55 inch (2) and Earbuds (16) each have two products tied for first
--     and two tied for third; TVs up to 43 inch (1) and Cables (35) each have two tied for second; lowest first, all four have two
--     tied for second. With no partition, products 1 and 2 tie for first;
--     products by units within store, highest first: a tie for first in stores NL-01 (1), NL-02 (2), NL-13 (13), BE-01 (15) and
--     LU-01 (24); for second in NL-13, LU-01 and WEB-01 (99); for third in all six;
--   two rows of one key at the same time: customers 3001 and 3002 each placed their two latest orders at the same moment (one in a
--   store, one on the web), and products 1 and 6 each had their latest check by both competitors at the same moment;
--   a missing month, week and day: no order in September 2024 (so LAG 12 over the months with orders is not the month a year
--   before for January to September 2025), none in the week of 10 March 2025, and store NL-01 orders on 3, 4, 5 and 7 March 2025
--   but not on the 6th;
--   cohorts whose later months fall after the as-of date (2026-01-05): customers 3011 and 3010 first order in November and December
--   2025. Customer 3012 orders on 31 January and 1 March 2025: two calendar months apart, 29 days apart (ERR-LOG-46);
--   two overlapping promotions on one product (SQL-PAT-09): promotions 2 (10% off products 20, 21 and 22, 7 to 20 April 2025) and
--   3 (20% off product 21, 18 to 21 April 2025) share 18 to 20 April; product 21's line on 19 April carries the deeper one, so a
--   date-range join to both promotions counts it twice. Products 20 and 21 sold in the 14 days before promotion 2, a baseline;
--   promotion 1 (Earbuds, October 2024) has no sale.
-- Beside them: store NL-13 opened on 2024-09-01, so it is not open in both years (like-for-like); guest orders (customer_id
-- missing); products 8, 15 and 21 change price. Lines follow E-103: the list price on the order date, less the deepest active
-- promotion's discount (half up); the build's own SQL below computes each line's price and discount from those rules. Costs follow
-- S6-07: the Audio products' cost rises 8% from 2025-07-01. The A/B rows follow sprint 5a: assignments in its two September 2025
-- weeks, and each conversion is one of the customer's web orders then, at its revenue.
CREATE SCHEMA voltmarkt_edge_pat;
CREATE TABLE voltmarkt_edge_pat.calendar AS SELECT * FROM voltmarkt.calendar
  WHERE cal_date BETWEEN DATE '2024-01-01' AND DATE '2025-12-31';
CREATE TABLE voltmarkt_edge_pat.stores AS SELECT * FROM voltmarkt.stores WHERE store_id IN (1, 2, 13, 15, 24, 99);
CREATE TABLE voltmarkt_edge_pat.categories AS SELECT * FROM voltmarkt.categories WHERE category_id IN (1, 2, 15, 16, 17, 35);
CREATE TABLE voltmarkt_edge_pat.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_pat.products VALUES
  (1, 'VM-000001', 'Vistara Pro 550', 'Vistara', 2, 'TVs 50-55 inch', NULL, 640.00, DATE '2023-04-03'),
  (2, 'VM-000002', 'Lumio Max 552', 'Lumio', 2, 'TVs 50-55 inch', NULL, 640.00, DATE '2023-08-14'),
  (3, 'VM-000003', 'Nordvue One 500', 'Nordvue', 2, 'TVs 50-55 inch', NULL, 420.00, DATE '2022-02-01'),
  (4, 'VM-000004', 'Vistara Neo 551', 'Vistara', 2, 'TVs 50-55 inch', NULL, 420.00, DATE '2024-03-04'),
  (5, 'VM-000005', 'Lumio Air 553', 'Lumio', 2, 'TVs 50-55 inch', NULL, 380.00, DATE '2024-09-02'),
  (6, 'VM-000006', 'Sonora Pro 311', 'Sonora', 16, 'Earbuds', 8, 99.00, DATE '2023-09-18'),
  (7, 'VM-000007', 'Basswell Air 140', 'Basswell', 16, 'Earbuds', NULL, 99.00, DATE '2024-01-15'),
  (8, 'VM-000008', 'Sonora Lite 312', 'Sonora', 16, 'Earbuds', 6, 45.00, DATE '2022-03-14'),
  (9, 'VM-000009', 'Echoline Buds 150', 'Echoline', 16, 'Earbuds', NULL, 45.00, DATE '2023-06-05'),
  (10, 'VM-000010', 'Basswell Go 120', 'Basswell', 16, 'Earbuds', NULL, 39.00, DATE '2024-05-06'),
  (11, 'VM-000011', 'Lumio Go 430', 'Lumio', 1, 'TVs up to 43 inch', NULL, 260.00, DATE '2023-01-09'),
  (12, 'VM-000012', 'Nordvue Lite 400', 'Nordvue', 1, 'TVs up to 43 inch', NULL, 220.00, DATE '2022-09-12'),
  (13, 'VM-000013', 'Vistara Mini 432', 'Vistara', 1, 'TVs up to 43 inch', NULL, 220.00, DATE '2024-02-19'),
  (14, 'VM-000014', 'Lumio Go 420', 'Lumio', 1, 'TVs up to 43 inch', NULL, 180.00, DATE '2021-11-01'),
  (15, 'VM-000015', 'Cablemate One 200', 'Cablemate', 35, 'Cables', NULL, 5.00, DATE '2022-06-01'),
  (16, 'VM-000016', 'Cablemate Flex 210', 'Cablemate', 35, 'Cables', NULL, 4.00, DATE '2023-03-06'),
  (17, 'VM-000017', 'Linkline USB-C 100', 'Linkline', 35, 'Cables', NULL, 4.00, DATE '2024-07-01'),
  (18, 'VM-000018', 'Linkline HDMI 110', 'Linkline', 35, 'Cables', NULL, 3.00, DATE '2022-10-03'),
  (19, 'VM-000019', 'Echoline Neo 420', 'Echoline', 17, 'Soundbars', NULL, 180.00, DATE '2022-05-10'),
  (20, 'VM-000020', 'Sonora Studio 510', 'Sonora', 15, 'Headphones', NULL, 120.00, DATE '2023-11-06'),
  (21, 'VM-000021', 'Basswell Over 520', 'Basswell', 15, 'Headphones', NULL, 80.00, DATE '2024-04-15'),
  (22, 'VM-000022', 'Echoline Fold 530', 'Echoline', 15, 'Headphones', NULL, 60.00, DATE '2022-08-22');
CREATE TABLE voltmarkt_edge_pat.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_pat.promotions VALUES
  (1, 'P-2024-41', 'Autumn Earbuds Week', 'percent_off', DATE '2024-10-14', DATE '2024-10-20', 15.00),
  (2, 'P-2025-41', 'Spring Headphones Days', 'percent_off', DATE '2025-04-07', DATE '2025-04-20', 10.00),
  (3, 'P-2025-42', 'Headphones Easter Weekend', 'percent_off', DATE '2025-04-18', DATE '2025-04-21', 20.00);
CREATE TABLE voltmarkt_edge_pat.promotion_products AS SELECT * FROM voltmarkt.promotion_products LIMIT 0;
INSERT INTO voltmarkt_edge_pat.promotion_products VALUES (1, 6), (1, 8), (2, 20), (2, 21), (2, 22), (3, 21);
CREATE TABLE voltmarkt_edge_pat.price_history AS SELECT * FROM voltmarkt.price_history LIMIT 0;
INSERT INTO voltmarkt_edge_pat.price_history VALUES
  (1, DATE '2023-04-03', NULL, 899.00),
  (2, DATE '2023-08-14', NULL, 899.00),
  (3, DATE '2022-02-01', NULL, 599.00),
  (4, DATE '2024-03-04', NULL, 599.00),
  (5, DATE '2024-09-02', NULL, 499.00),
  (6, DATE '2023-09-18', NULL, 179.00),
  (7, DATE '2024-01-15', NULL, 179.00),
  (8, DATE '2022-03-14', DATE '2025-01-31', 64.99),
  (8, DATE '2025-02-01', NULL, 69.00),
  (9, DATE '2023-06-05', NULL, 69.00),
  (10, DATE '2024-05-06', NULL, 59.00),
  (11, DATE '2023-01-09', NULL, 349.00),
  (12, DATE '2022-09-12', NULL, 299.00),
  (13, DATE '2024-02-19', NULL, 299.00),
  (14, DATE '2021-11-01', NULL, 249.00),
  (15, DATE '2022-06-01', DATE '2025-01-31', 12.99),
  (15, DATE '2025-02-01', DATE '2025-03-31', 10.99),
  (15, DATE '2025-04-01', NULL, 12.99),
  (16, DATE '2023-03-06', NULL, 9.99),
  (17, DATE '2024-07-01', NULL, 9.99),
  (18, DATE '2022-10-03', NULL, 7.99),
  (19, DATE '2022-05-10', NULL, 299.00),
  (20, DATE '2023-11-06', NULL, 199.00),
  (21, DATE '2024-04-15', DATE '2025-02-28', 139.00),
  (21, DATE '2025-03-01', NULL, 129.00),
  (22, DATE '2022-08-22', NULL, 89.00);
CREATE TABLE voltmarkt_edge_pat.orders AS SELECT * FROM voltmarkt.orders LIMIT 0;
INSERT INTO voltmarkt_edge_pat.orders VALUES
  (1, 3001, 1, TIMESTAMP '2024-01-09 10:15:00', 'store', 'NL'),
  (2, NULL, 99, TIMESTAMP '2024-01-22 19:40:00', 'web', 'NL'),
  (3, 3003, 15, TIMESTAMP '2024-02-06 13:05:00', 'store', 'BE'),
  (4, 3002, 2, TIMESTAMP '2024-02-20 11:30:00', 'store', 'NL'),
  (5, NULL, 24, TIMESTAMP '2024-03-12 15:45:00', 'store', 'LU'),
  (6, 3004, 99, TIMESTAMP '2024-03-26 21:10:00', 'web', 'BE'),
  (7, 3001, 1, TIMESTAMP '2024-04-09 09:50:00', 'store', 'NL'),
  (8, 3005, 15, TIMESTAMP '2024-04-23 17:25:00', 'store', 'BE'),
  (9, NULL, 2, TIMESTAMP '2024-05-14 12:00:00', 'store', 'NL'),
  (10, 3006, 99, TIMESTAMP '2024-05-28 20:30:00', 'web', 'NL'),
  (11, 3002, 1, TIMESTAMP '2024-06-11 16:40:00', 'store', 'NL'),
  (12, 3003, 24, TIMESTAMP '2024-06-25 10:20:00', 'store', 'LU'),
  (13, NULL, 99, TIMESTAMP '2024-07-09 22:05:00', 'web', 'LU'),
  (14, 3007, 15, TIMESTAMP '2024-07-23 14:15:00', 'store', 'BE'),
  (15, 3004, 2, TIMESTAMP '2024-08-13 11:45:00', 'store', 'NL'),
  (16, NULL, 1, TIMESTAMP '2024-08-27 18:30:00', 'store', 'NL'),
  (17, 3008, 13, TIMESTAMP '2024-10-08 12:10:00', 'store', 'NL'),
  (18, 3001, 99, TIMESTAMP '2024-10-22 20:50:00', 'web', 'NL'),
  (19, 3005, 15, TIMESTAMP '2024-11-12 15:30:00', 'store', 'BE'),
  (20, NULL, 13, TIMESTAMP '2024-11-26 11:00:00', 'store', 'NL'),
  (21, 3002, 24, TIMESTAMP '2024-12-10 16:15:00', 'store', 'LU'),
  (22, 3009, 99, TIMESTAMP '2024-12-23 19:05:00', 'web', 'BE'),
  (23, 3001, 1, TIMESTAMP '2025-01-14 10:30:00', 'store', 'NL'),
  (24, 3012, 99, TIMESTAMP '2025-01-31 18:45:00', 'web', 'NL'),
  (25, NULL, 15, TIMESTAMP '2025-02-11 13:20:00', 'store', 'BE'),
  (26, 3003, 99, TIMESTAMP '2025-02-25 20:15:00', 'web', 'BE'),
  (27, 3012, 99, TIMESTAMP '2025-03-01 11:05:00', 'web', 'NL'),
  (28, 3006, 1, TIMESTAMP '2025-03-03 10:10:00', 'store', 'NL'),
  (29, NULL, 1, TIMESTAMP '2025-03-04 15:25:00', 'store', 'NL'),
  (30, 3007, 1, TIMESTAMP '2025-03-05 12:40:00', 'store', 'NL'),
  (31, NULL, 1, TIMESTAMP '2025-03-07 17:55:00', 'store', 'NL'),
  (32, 3004, 2, TIMESTAMP '2025-03-18 11:15:00', 'store', 'NL'),
  (33, NULL, 1, TIMESTAMP '2025-03-27 16:30:00', 'store', 'NL'),
  (34, 3008, 15, TIMESTAMP '2025-03-31 14:00:00', 'store', 'BE'),
  (35, NULL, 24, TIMESTAMP '2025-04-08 12:20:00', 'store', 'LU'),
  (36, 3009, 13, TIMESTAMP '2025-04-10 15:50:00', 'store', 'NL'),
  (37, 3002, 2, TIMESTAMP '2025-04-12 10:40:00', 'store', 'NL'),
  (38, NULL, 99, TIMESTAMP '2025-04-19 21:30:00', 'web', 'NL'),
  (39, 3001, 1, TIMESTAMP '2025-05-06 16:10:00', 'store', 'NL'),
  (40, 3013, 15, TIMESTAMP '2025-05-20 11:35:00', 'store', 'BE'),
  (41, NULL, 99, TIMESTAMP '2025-06-03 19:20:00', 'web', 'LU'),
  (42, 3005, 24, TIMESTAMP '2025-06-17 13:10:00', 'store', 'LU'),
  (43, 3006, 2, TIMESTAMP '2025-07-08 12:25:00', 'store', 'NL'),
  (44, NULL, 99, TIMESTAMP '2025-07-22 22:40:00', 'web', 'BE'),
  (45, 3007, 13, TIMESTAMP '2025-08-05 10:50:00', 'store', 'NL'),
  (46, NULL, 15, TIMESTAMP '2025-08-19 16:05:00', 'store', 'BE'),
  (47, 3004, 2, TIMESTAMP '2025-09-09 11:20:00', 'store', 'NL'),
  (48, 3013, 99, TIMESTAMP '2025-09-10 20:35:00', 'web', 'NL'),
  (49, 3008, 24, TIMESTAMP '2025-10-07 14:45:00', 'store', 'LU'),
  (50, NULL, 13, TIMESTAMP '2025-10-21 12:15:00', 'store', 'NL'),
  (51, 3011, 2, TIMESTAMP '2025-11-04 10:05:00', 'store', 'NL'),
  (52, 3002, 15, TIMESTAMP '2025-11-18 09:00:00', 'store', 'BE'),
  (53, 3002, 99, TIMESTAMP '2025-11-18 09:00:00', 'web', 'BE'),
  (54, 3010, 24, TIMESTAMP '2025-12-02 15:30:00', 'store', 'LU'),
  (55, 3001, 1, TIMESTAMP '2025-12-09 17:20:00', 'store', 'NL'),
  (56, 3001, 99, TIMESTAMP '2025-12-09 17:20:00', 'web', 'NL'),
  (57, 3011, 13, TIMESTAMP '2025-12-16 13:40:00', 'store', 'NL');
-- Each line's unit price is the product's list price on the order date, and its promotion the deepest one active that day (E-103);
-- its discount is quantity x price x that promotion's discount_pct / 100, half up to the cent.
CREATE TABLE voltmarkt_edge_pat.order_lines AS SELECT * FROM voltmarkt.order_lines LIMIT 0;
INSERT INTO voltmarkt_edge_pat.order_lines
WITH l AS (SELECT v.*, CAST(o.order_ts AS DATE) AS d FROM (VALUES
  (1, 1, 14, 1), (2, 1, 15, 2), (3, 2, 6, 1), (4, 3, 3, 1), (5, 3, 22, 1), (6, 4, 12, 1), (7, 5, 19, 1), (8, 6, 8, 2), (9, 6, 16, 1),
  (10, 7, 2, 1), (11, 8, 21, 1), (12, 9, 11, 1), (13, 9, 18, 2), (14, 10, 10, 1), (15, 10, 9, 1), (16, 11, 1, 1), (17, 12, 20, 1),
  (18, 13, 17, 2), (19, 14, 7, 1), (20, 14, 13, 1), (21, 15, 4, 1), (22, 16, 15, 1), (23, 16, 22, 1), (24, 17, 5, 1), (25, 18, 6, 1),
  (26, 19, 12, 1), (27, 19, 16, 1), (28, 20, 11, 1), (29, 21, 2, 1), (30, 21, 18, 1), (31, 22, 20, 1),
  (32, 23, 15, 2), (33, 24, 9, 1), (34, 25, 18, 2), (35, 26, 8, 2), (36, 27, 9, 1), (37, 28, 6, 1), (38, 29, 14, 1), (39, 30, 6, 1),
  (40, 31, 11, 1), (41, 32, 12, 2), (42, 33, 21, 1), (43, 34, 20, 1), (44, 35, 22, 1), (45, 36, 21, 1), (46, 37, 20, 1), (47, 38, 21, 1),
  (48, 39, 22, 1), (49, 40, 7, 2), (50, 41, 16, 3), (51, 42, 3, 1), (52, 43, 17, 2), (53, 44, 5, 1), (54, 45, 10, 1), (55, 46, 13, 1),
  (56, 47, 4, 1), (57, 48, 15, 2), (58, 49, 13, 1), (59, 50, 11, 1), (60, 51, 2, 1), (61, 52, 2, 1), (62, 53, 1, 1), (63, 54, 19, 1),
  (64, 55, 1, 1), (65, 56, 22, 1), (66, 57, 17, 1)
) AS v(order_line_id, order_id, product_id, quantity) JOIN voltmarkt_edge_pat.orders o ON o.order_id = v.order_id),
-- the promotions active for each line, deepest first
c AS (SELECT l.order_line_id, p.promo_id, p.discount_pct,
             row_number() OVER (PARTITION BY l.order_line_id ORDER BY p.discount_pct DESC, p.promo_id) AS k
      FROM l JOIN voltmarkt_edge_pat.promotion_products pp ON pp.product_id = l.product_id
      JOIN voltmarkt_edge_pat.promotions p ON p.promo_id = pp.promo_id AND l.d BETWEEN p.start_date AND p.end_date)
SELECT l.order_line_id, l.order_id, l.product_id, l.quantity, ph.list_price_eur, c.promo_id,
       coalesce(round(l.quantity * ph.list_price_eur * c.discount_pct / 100, 2), 0.00)
FROM l
JOIN voltmarkt_edge_pat.price_history ph ON ph.product_id = l.product_id AND l.d >= ph.valid_from AND (ph.valid_to IS NULL OR l.d <= ph.valid_to)
LEFT JOIN c ON c.order_line_id = l.order_line_id AND c.k = 1;
CREATE TABLE voltmarkt_edge_pat.competitor_prices AS SELECT * FROM voltmarkt.competitor_prices LIMIT 0;
INSERT INTO voltmarkt_edge_pat.competitor_prices VALUES
  (1, 'Bliksem', TIMESTAMP '2024-05-06 06:10:00', 879.99),
  (1, 'Stroomhuis', TIMESTAMP '2025-11-17 07:00:00', 889.99),
  (1, 'Bliksem', TIMESTAMP '2025-11-17 07:00:00', 869.99),
  (2, 'Stroomhuis', TIMESTAMP '2024-12-02 06:50:00', 879.99),
  (2, 'Bliksem', TIMESTAMP '2025-08-04 06:15:00', 884.99),
  (6, 'Bliksem', TIMESTAMP '2024-10-14 06:30:00', 169.99),
  (6, 'Stroomhuis', TIMESTAMP '2025-06-02 06:45:00', 174.99),
  (6, 'Bliksem', TIMESTAMP '2025-06-02 06:45:00', 172.99),
  (11, 'Stroomhuis', TIMESTAMP '2025-01-13 07:20:00', 339.99);
CREATE TABLE voltmarkt_edge_pat.ab_assignments AS SELECT * FROM voltmarkt.ab_assignments LIMIT 0;
INSERT INTO voltmarkt_edge_pat.ab_assignments VALUES
  ('AB-2025-01', 3004, 'control', TIMESTAMP '2025-09-03 12:00:00'),
  ('AB-2025-01', 3001, 'control', TIMESTAMP '2025-09-05 18:00:00'),
  ('AB-2025-01', 3013, 'treatment', TIMESTAMP '2025-09-10 20:15:00');
CREATE TABLE voltmarkt_edge_pat.ab_conversions AS SELECT * FROM voltmarkt.ab_conversions LIMIT 0;
INSERT INTO voltmarkt_edge_pat.ab_conversions VALUES
  ('AB-2025-01', 3013, TIMESTAMP '2025-09-10 20:35:00', 25.98);
CREATE TABLE voltmarkt_edge_pat.cost_history AS SELECT * FROM voltmarkt.cost_history LIMIT 0;
INSERT INTO voltmarkt_edge_pat.cost_history VALUES
  (1, DATE '2023-04-03', NULL, 640.00),
  (2, DATE '2023-08-14', NULL, 640.00),
  (3, DATE '2022-02-01', NULL, 420.00),
  (4, DATE '2024-03-04', NULL, 420.00),
  (5, DATE '2024-09-02', NULL, 380.00),
  (6, DATE '2023-09-18', DATE '2025-06-30', 99.00),
  (6, DATE '2025-07-01', NULL, 106.92),
  (7, DATE '2024-01-15', DATE '2025-06-30', 99.00),
  (7, DATE '2025-07-01', NULL, 106.92),
  (8, DATE '2022-03-14', DATE '2025-06-30', 45.00),
  (8, DATE '2025-07-01', NULL, 48.60),
  (9, DATE '2023-06-05', DATE '2025-06-30', 45.00),
  (9, DATE '2025-07-01', NULL, 48.60),
  (10, DATE '2024-05-06', DATE '2025-06-30', 39.00),
  (10, DATE '2025-07-01', NULL, 42.12),
  (11, DATE '2023-01-09', NULL, 260.00),
  (12, DATE '2022-09-12', NULL, 220.00),
  (13, DATE '2024-02-19', NULL, 220.00),
  (14, DATE '2021-11-01', NULL, 180.00),
  (15, DATE '2022-06-01', NULL, 5.00),
  (16, DATE '2023-03-06', NULL, 4.00),
  (17, DATE '2024-07-01', NULL, 4.00),
  (18, DATE '2022-10-03', NULL, 3.00),
  (19, DATE '2022-05-10', DATE '2025-06-30', 180.00),
  (19, DATE '2025-07-01', NULL, 194.40),
  (20, DATE '2023-11-06', DATE '2025-06-30', 120.00),
  (20, DATE '2025-07-01', NULL, 129.60),
  (21, DATE '2024-04-15', DATE '2025-06-30', 80.00),
  (21, DATE '2025-07-01', NULL, 86.40),
  (22, DATE '2022-08-22', DATE '2025-06-30', 60.00),
  (22, DATE '2025-07-01', NULL, 64.80);
-- Sprint 8 Part 2 (S8-15, E-212; S8-C35): chain-wide daily stock, for a 28-day stock cover question over 1 to 28 December 2024 with
-- the stock on 29 December (CASE-RETAIL-04), FIND-01-09's month on the visible data too: every day of December 2024 for five store and
-- product pairs in the physical stores (the webshop has no rows, as in voltmarkt). Voltmarkt's table covers its consoles and
-- controllers, but this edge holds no console or controller (adding one would change its products and categories), so its pairs are
-- four TVs and a cable, and a query that keeps only those two categories finds no row here. A day closes at the stock of the day before
-- (the opening stock on 1 December), plus that day's deliveries, less the units that store sold that day (the order lines above) and
-- any units sent back to the supplier that day (as voltmarkt's PlayBox 5 units are on 2024-12-06); the build's own SQL below computes
-- each row from those rules, and no shelf sells its last unit. Planted (pipeline/tests/test_edge_pat.py holds each), on order 21
-- (LU-01, 10 December 2024), the window's only store sales:
--   a stockout with a sale on the in-stock days: LU-01 (24) and product 2 sell 1 unit on 10 December, send their last unit back on 14
--   December and are out of stock from 14 to 28 December, so a rate over all 28 days differs from one over the 13 in-stock days;
--   a pair near the 2-weeks threshold that the rate over every day gets wrong: the same pair gets 1 unit on 29 December, 1.86 weeks of
--   cover at the rate over its in-stock days and 4.0 at the rate over all 28 days;
--   a product with days of no sales: LU-01 and product 18 sell on 10 December only, so a daily sales series needs a date spine (an
--   average over the days with sales puts it under 2 weeks of cover; the spine gives 12).
-- Beside them: NL-01 (1) and product 14, NL-13 (13) and product 11, and BE-01 (15) and product 12 sell nothing in the window (a rate
-- of 0); NL-13's product 11 last sold on 26 November, before it.
CREATE TABLE voltmarkt_edge_pat.inventory_chain_daily AS SELECT * FROM voltmarkt.inventory_chain_daily LIMIT 0;
INSERT INTO voltmarkt_edge_pat.inventory_chain_daily
WITH pairs AS (SELECT * FROM (VALUES (1, 14, 2), (13, 11, 1), (15, 12, 2), (24, 2, 2), (24, 18, 4)) AS v(store_id, product_id, opening)),
deliveries AS (SELECT * FROM (VALUES (24, 2, DATE '2024-12-29', 1)) AS v(store_id, product_id, move_date, units)),
sent_back AS (SELECT * FROM (VALUES (24, 2, DATE '2024-12-14', 1)) AS v(store_id, product_id, move_date, units)),
days AS (SELECT CAST(range AS DATE) AS snapshot_date FROM range(DATE '2024-12-01', DATE '2025-01-01', INTERVAL 1 DAY)),
sold AS (SELECT o.store_id, l.product_id, CAST(o.order_ts AS DATE) AS sale_date, sum(l.quantity) AS units
         FROM voltmarkt_edge_pat.order_lines l JOIN voltmarkt_edge_pat.orders o ON o.order_id = l.order_id GROUP BY ALL)
SELECT days.snapshot_date, p.store_id, p.product_id,
       p.opening
       + (SELECT coalesce(sum(x.units), 0) FROM deliveries x
          WHERE x.store_id = p.store_id AND x.product_id = p.product_id AND x.move_date <= days.snapshot_date)
       - (SELECT coalesce(sum(x.units), 0) FROM sent_back x
          WHERE x.store_id = p.store_id AND x.product_id = p.product_id AND x.move_date <= days.snapshot_date)
       - (SELECT coalesce(sum(s.units), 0) FROM sold s
          WHERE s.store_id = p.store_id AND s.product_id = p.product_id AND s.sale_date BETWEEN DATE '2024-12-01' AND days.snapshot_date)
FROM pairs p, days;

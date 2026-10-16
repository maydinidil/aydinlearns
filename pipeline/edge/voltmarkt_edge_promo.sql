-- pipeline/edge/voltmarkt_edge_promo.sql (cases: CASE-PRICE-03 to -05, CASE-RETAIL-03; E-006, E-011, E-092)
-- Sprint 6 (S6-04): the level 4 promotion, margin and like-for-like cases, with every voltmarkt table name; the build adds
-- the sales, weekly competitor price and weekly_units views (S6-06). The calendar holds whole ISO weeks: every week with an
-- order (UTC dates), and P-2025-03's 4 baseline and 2 promotion weeks, 21 weeks in all, so bucketing orders through
-- calendar.quarter or calendar.month_start drops none, and weekly_units holds every unit sold. Planted:
--   a promoted product with weeks of no sales (E-011): Basswell Air (3) is in P-2025-18 (4 to 17 August) and sold nothing in
--   two of its four baseline weeks and in the second promotion week; Sonora Pro 311 (1) is in the same promotion, and its
--   sister Sonora Lite 312 (2) is not;
--   a product in two promotions: the soundbar (4) is in P-2025-12 (May) and in P-2025-19 (11 to 17 August), and has a
--   week of no sales in that one's baseline;
--   a store opened inside the like-for-like window (September 2025 against September 2024; eligible stores opened by
--   1 September 2023): NL-13 opened on 1 September 2024 and sells in both Septembers;
--   a closed store: NL-06 closed on 30 June 2025, with sales in September 2024 only;
--   an eligible store with no sales in one period (E-006): NL-04, open since 2011, sells in September 2024 only;
--   a cost change inside a quarter: the TV (5) costs 640.00 to 14 August 2025 and 672.00 from 15 August, with sales in Q3
--   on both sides; the Audio products' cost rises 8% on 1 July 2025, as in voltmarkt (S6-07);
--   Q2 against Q3 2025: products sold in both quarters, a product sold only in Q2 (6) and one launched in Q3 (7).
-- Sprint 6 Task B1 (fix round): CASE-PRICE-04's promotion, P-2025-03 (05 FIND-01-05, E-092), with voltmarkt's code, name,
-- dates (10 to 23 March 2025) and discount: Sonora Pro 311 (1) and a second Earbuds product, Basswell Air (3), are in it (so
-- each is in two promotions, with P-2025-18), and the Pro product's sister, Sonora Lite 312 (2), is not, so the promotion
-- holds more than one product and every promoted product leaves the cannibalisation set. Orders 18 to 23 (lines 37 to 52)
-- sell Earbuds in each of its 4 baseline weeks (10 February to 9 March, the first on its first day) and its 2 promotion
-- weeks (the last on its last day, a Sunday), with weeks of no sales (E-011): Basswell Air sells nothing in the first
-- baseline week, and the Lite sister nothing in the second promotion week.
-- Line prices follow E-103: the list price on the order date, less the promotion's discount (half up).
CREATE SCHEMA voltmarkt_edge_promo;
CREATE TABLE voltmarkt_edge_promo.calendar AS SELECT * FROM voltmarkt.calendar
  WHERE cal_date BETWEEN DATE '2024-08-26' AND DATE '2024-09-01'
     OR cal_date BETWEEN DATE '2024-09-09' AND DATE '2024-09-22'
     OR cal_date BETWEEN DATE '2025-02-10' AND DATE '2025-03-23'
     OR cal_date BETWEEN DATE '2025-05-05' AND DATE '2025-05-25'
     OR cal_date BETWEEN DATE '2025-07-07' AND DATE '2025-08-17'
     OR cal_date BETWEEN DATE '2025-09-01' AND DATE '2025-09-21';
CREATE TABLE voltmarkt_edge_promo.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_promo.stores VALUES
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL),
  (4, 'NL-04', 'Utrecht', 'NL', 'standard', 'Europe/Amsterdam', DATE '2011-09-01', NULL),
  (6, 'NL-06', 'Zwolle', 'NL', 'standard', 'Europe/Amsterdam', DATE '2016-10-01', DATE '2025-06-30'),
  (13, 'NL-13', 'Almere', 'NL', 'standard', 'Europe/Amsterdam', DATE '2024-09-01', NULL),
  (15, 'BE-01', 'Brussel', 'BE', 'flagship', 'Europe/Brussels', DATE '2014-09-01', NULL),
  (99, 'WEB-01', 'Online', 'NL', 'web', 'UTC', DATE '2015-01-01', NULL);
CREATE TABLE voltmarkt_edge_promo.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_promo.categories VALUES
  (1, 'TVs up to 43 inch', 'TV & Video'),
  (2, 'TVs 50-55 inch', 'TV & Video'),
  (16, 'Earbuds', 'Audio'),
  (17, 'Soundbars', 'Audio'),
  (35, 'Cables', 'Accessories');
CREATE TABLE voltmarkt_edge_promo.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_promo.products VALUES
  (1, 'VM-000001', 'Sonora Pro 311', 'Sonora', 16, 'Earbuds', 2, 99.00, DATE '2023-09-18'),
  (2, 'VM-000002', 'Sonora Lite 312', 'Sonora', 16, 'Earbuds', 1, 39.00, DATE '2022-03-14'),
  (3, 'VM-000003', 'Basswell Air 140', 'Basswell', 16, 'Earbuds', NULL, 45.00, DATE '2024-01-15'),
  (4, 'VM-000004', 'Echoline Neo 420', 'Echoline', 17, 'Soundbars', NULL, 180.00, DATE '2022-05-10'),
  (5, 'VM-000005', 'Vistara Pro 550', 'Vistara', 2, 'TVs 50-55 inch', NULL, 640.00, DATE '2023-04-03'),
  (6, 'VM-000006', 'Cablemate One 200', 'Cablemate', 35, 'Cables', NULL, 5.00, DATE '2022-06-01'),
  (7, 'VM-000007', 'Lumio Go 430', 'Lumio', 1, 'TVs up to 43 inch', NULL, 220.00, DATE '2025-07-14');
CREATE TABLE voltmarkt_edge_promo.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_promo.promotions VALUES
  (1, 'P-2025-12', 'Spring Soundbar Deal', 'percent_off', DATE '2025-05-12', DATE '2025-05-25', 10.00),
  (2, 'P-2025-18', 'Summer Earbuds Days', 'percent_off', DATE '2025-08-04', DATE '2025-08-17', 25.00),
  (3, 'P-2025-19', 'Soundbar Week', 'percent_off', DATE '2025-08-11', DATE '2025-08-17', 15.00),
  (4, 'P-2025-03', 'Spring Audio Deals', 'percent_off', DATE '2025-03-10', DATE '2025-03-23', 25.00);
CREATE TABLE voltmarkt_edge_promo.promotion_products AS SELECT * FROM voltmarkt.promotion_products LIMIT 0;
INSERT INTO voltmarkt_edge_promo.promotion_products VALUES (1, 4), (2, 1), (2, 3), (3, 4), (4, 1), (4, 3);
CREATE TABLE voltmarkt_edge_promo.price_history AS SELECT * FROM voltmarkt.price_history LIMIT 0;
INSERT INTO voltmarkt_edge_promo.price_history VALUES
  (1, DATE '2023-09-18', NULL, 179.00),
  (2, DATE '2022-03-14', NULL, 69.00),
  (3, DATE '2024-01-15', NULL, 79.00),
  (4, DATE '2022-05-10', NULL, 299.00),
  (5, DATE '2023-04-03', NULL, 899.00),
  (6, DATE '2022-06-01', NULL, 12.99),
  (7, DATE '2025-07-14', NULL, 349.00);
CREATE TABLE voltmarkt_edge_promo.orders AS SELECT * FROM voltmarkt.orders LIMIT 0;
INSERT INTO voltmarkt_edge_promo.orders VALUES
  (1, 5001, 1, TIMESTAMP '2024-09-10 11:00:00', 'store', 'NL'),
  (2, 5002, 15, TIMESTAMP '2024-09-12 15:30:00', 'store', 'BE'),
  (3, 5003, 4, TIMESTAMP '2024-09-14 10:20:00', 'store', 'NL'),
  (4, NULL, 6, TIMESTAMP '2024-09-17 16:45:00', 'store', 'NL'),
  (5, 5004, 13, TIMESTAMP '2024-09-01 12:10:00', 'store', 'NL'),
  (6, 5001, 1, TIMESTAMP '2025-05-06 10:30:00', 'store', 'NL'),
  (7, 5005, 99, TIMESTAMP '2025-05-14 20:00:00', 'web', 'NL'),
  (8, 5002, 15, TIMESTAMP '2025-05-20 15:15:00', 'store', 'BE'),
  (9, 5006, 1, TIMESTAMP '2025-07-08 11:00:00', 'store', 'NL'),
  (10, 5007, 99, TIMESTAMP '2025-07-15 19:30:00', 'web', 'BE'),
  (11, 5002, 15, TIMESTAMP '2025-07-22 14:00:00', 'store', 'BE'),
  (12, 5008, 99, TIMESTAMP '2025-07-30 20:15:00', 'web', 'NL'),
  (13, 5001, 1, TIMESTAMP '2025-08-05 12:00:00', 'store', 'NL'),
  (14, NULL, 99, TIMESTAMP '2025-08-12 18:40:00', 'web', 'LU'),
  (15, 5001, 1, TIMESTAMP '2025-09-05 10:45:00', 'store', 'NL'),
  (16, 5002, 15, TIMESTAMP '2025-09-09 13:20:00', 'store', 'BE'),
  (17, 5004, 13, TIMESTAMP '2025-09-20 11:30:00', 'store', 'NL'),
  (18, 5001, 1, TIMESTAMP '2025-02-10 10:30:00', 'store', 'NL'),
  (19, 5005, 99, TIMESTAMP '2025-02-19 19:10:00', 'web', 'NL'),
  (20, 5002, 15, TIMESTAMP '2025-02-27 14:45:00', 'store', 'BE'),
  (21, 5006, 1, TIMESTAMP '2025-03-08 11:15:00', 'store', 'NL'),
  (22, 5007, 99, TIMESTAMP '2025-03-12 20:05:00', 'web', 'BE'),
  (23, NULL, 15, TIMESTAMP '2025-03-23 15:20:00', 'store', 'BE');
CREATE TABLE voltmarkt_edge_promo.order_lines AS SELECT * FROM voltmarkt.order_lines LIMIT 0;
INSERT INTO voltmarkt_edge_promo.order_lines VALUES
  (1, 1, 5, 1, 899.00, NULL, 0.00),
  (2, 2, 1, 2, 179.00, NULL, 0.00),
  (3, 3, 2, 1, 69.00, NULL, 0.00),
  (4, 4, 4, 1, 299.00, NULL, 0.00),
  (5, 5, 2, 2, 69.00, NULL, 0.00),
  (6, 6, 5, 1, 899.00, NULL, 0.00),
  (7, 6, 6, 3, 12.99, NULL, 0.00),
  (8, 7, 1, 1, 179.00, NULL, 0.00),
  (9, 7, 2, 2, 69.00, NULL, 0.00),
  (10, 8, 4, 1, 299.00, 1, 29.90),
  (11, 9, 1, 2, 179.00, NULL, 0.00),
  (12, 9, 2, 2, 69.00, NULL, 0.00),
  (13, 9, 3, 2, 79.00, NULL, 0.00),
  (14, 9, 4, 1, 299.00, NULL, 0.00),
  (15, 10, 1, 1, 179.00, NULL, 0.00),
  (16, 10, 2, 2, 69.00, NULL, 0.00),
  (17, 10, 4, 1, 299.00, NULL, 0.00),
  (18, 11, 1, 2, 179.00, NULL, 0.00),
  (19, 11, 2, 1, 69.00, NULL, 0.00),
  (20, 11, 7, 1, 349.00, NULL, 0.00),
  (21, 12, 1, 1, 179.00, NULL, 0.00),
  (22, 12, 2, 3, 69.00, NULL, 0.00),
  (23, 12, 3, 2, 79.00, NULL, 0.00),
  (24, 12, 4, 1, 299.00, NULL, 0.00),
  (25, 13, 1, 5, 179.00, 2, 223.75),
  (26, 13, 2, 1, 69.00, NULL, 0.00),
  (27, 13, 3, 3, 79.00, 2, 59.25),
  (28, 13, 4, 1, 299.00, NULL, 0.00),
  (29, 13, 5, 1, 899.00, NULL, 0.00),
  (30, 14, 1, 4, 179.00, 2, 179.00),
  (31, 14, 2, 1, 69.00, NULL, 0.00),
  (32, 14, 4, 3, 299.00, 3, 134.55),
  (33, 15, 5, 1, 899.00, NULL, 0.00),
  (34, 15, 2, 1, 69.00, NULL, 0.00),
  (35, 16, 1, 1, 179.00, NULL, 0.00),
  (36, 17, 2, 3, 69.00, NULL, 0.00),
  (37, 18, 1, 1, 179.00, NULL, 0.00),
  (38, 18, 2, 3, 69.00, NULL, 0.00),
  (39, 19, 1, 1, 179.00, NULL, 0.00),
  (40, 19, 2, 2, 69.00, NULL, 0.00),
  (41, 19, 3, 1, 79.00, NULL, 0.00),
  (42, 20, 1, 2, 179.00, NULL, 0.00),
  (43, 20, 2, 3, 69.00, NULL, 0.00),
  (44, 20, 3, 2, 79.00, NULL, 0.00),
  (45, 21, 1, 1, 179.00, NULL, 0.00),
  (46, 21, 2, 2, 69.00, NULL, 0.00),
  (47, 21, 3, 1, 79.00, NULL, 0.00),
  (48, 22, 1, 3, 179.00, 4, 134.25),
  (49, 22, 2, 3, 69.00, NULL, 0.00),
  (50, 22, 3, 2, 79.00, 4, 39.50),
  (51, 23, 1, 4, 179.00, 4, 179.00),
  (52, 23, 3, 1, 79.00, 4, 19.75);
CREATE TABLE voltmarkt_edge_promo.competitor_prices AS SELECT * FROM voltmarkt.competitor_prices LIMIT 0;
INSERT INTO voltmarkt_edge_promo.competitor_prices VALUES
  (1, 'Bliksem', TIMESTAMP '2025-08-05 06:10:00', 169.99),
  (1, 'Stroomhuis', TIMESTAMP '2025-08-06 07:15:00', 184.99),
  (2, 'Bliksem', TIMESTAMP '2025-08-05 06:20:00', 64.99);
CREATE TABLE voltmarkt_edge_promo.ab_assignments AS SELECT * FROM voltmarkt.ab_assignments LIMIT 0;
INSERT INTO voltmarkt_edge_promo.ab_assignments VALUES
  ('AB-2025-01', 5007, 'control', TIMESTAMP '2025-09-01 09:00:00'),
  ('AB-2025-01', 5008, 'treatment', TIMESTAMP '2025-09-02 10:30:00');
CREATE TABLE voltmarkt_edge_promo.ab_conversions AS SELECT * FROM voltmarkt.ab_conversions LIMIT 0;
INSERT INTO voltmarkt_edge_promo.ab_conversions VALUES
  ('AB-2025-01', 5008, TIMESTAMP '2025-09-02 10:55:00', 69.00);
CREATE TABLE voltmarkt_edge_promo.cost_history AS SELECT * FROM voltmarkt.cost_history LIMIT 0;
INSERT INTO voltmarkt_edge_promo.cost_history VALUES
  (1, DATE '2023-09-18', DATE '2025-06-30', 99.00),
  (1, DATE '2025-07-01', NULL, 106.92),
  (2, DATE '2022-03-14', DATE '2025-06-30', 39.00),
  (2, DATE '2025-07-01', NULL, 42.12),
  (3, DATE '2024-01-15', DATE '2025-06-30', 45.00),
  (3, DATE '2025-07-01', NULL, 48.60),
  (4, DATE '2022-05-10', DATE '2025-06-30', 180.00),
  (4, DATE '2025-07-01', NULL, 194.40),
  (5, DATE '2023-04-03', DATE '2025-08-14', 640.00),
  (5, DATE '2025-08-15', NULL, 672.00),
  (6, DATE '2022-06-01', NULL, 5.00),
  (7, DATE '2025-07-14', NULL, 220.00);

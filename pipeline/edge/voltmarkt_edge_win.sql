-- pipeline/edge/voltmarkt_edge_win.sql (family: SQL-WIN-01 to SQL-WIN-07; ERR-LOG-37 to ERR-LOG-43, ERR-SYN-08, ERR-LOG-20)
-- Sprint 7 (S7-25, S7-22): the level 5 window cases, with every voltmarkt table name; the build adds the sales, weekly competitor
-- price and weekly_units views. Orders run from January to June 2025. Planted (pipeline/tests/test_edge_win.py holds each):
--   ties at rank cutoffs in two partitions, by unit cost and by revenue (January to June 2025) within category: TVs 50-55 inch (2)
--   and Earbuds (16) each have two products tied for first place and two tied for third (highest first); TVs up to 43 inch (1) and
--   Cables (35) each have two tied for second; lowest first, all four categories have two tied for second. Customers 3001 and 3002
--   each placed their two latest orders at the same moment, and products 1 and 6 each had their two latest competitor checks at
--   the same moment. Without a partition, products 1 and 2 also tie for first on revenue;
--   partitions with one row: Soundbars (17) has one product, store LU-01 (24) one order, customers 3003 and 3006 one order each,
--   product 11 one competitor check;
--   a missing value in a window ORDER BY column: product 5 (TVs 50-55 inch) has no launch date; it sold, and its price and cost
--   versions start on its first price day;
--   a month with no rows between two months with rows: no order in April 2025, between March and May, while the calendar holds every
--   day from 1 January to 30 June 2025; customer 3004 orders in January, then May and June;
--   two rows with the same ORDER BY date: store NL-01 (1) has two orders on 14 February 2025, and the tied latest orders above;
--   a group of 3 rows under NTILE(5): Headphones (15) has three products, and customer 3004 has three orders.
-- For CASE-RETAIL-05 (E-203: R by NTILE(5) with customer_id as the tie-break), customers 3001 and 3004 last ordered on the same day,
-- 10 June 2025, so NTILE(5) by last order day splits them by the tie-break's direction.
-- Sprint 7d (Task K2, S7D-13; pipeline/tests/test_edge_7d.py holds each):
--   CASE-RETAIL-05's money tie: customers 3002 and 3006 have the same revenue (order 7's line of product 12 is in web order 11,
--   which holds two more lines, and order 13 holds one more), so NTILE(5) by revenue puts them either side of the boundary between
--   M 3 and M 4 by the tie-break's direction; 3002 has an R of 5 and five orders, so the tie-break decides whether it is a champion,
--   while 3006 has one order. The webshop's products 12 and 19 still tie at its 60% revenue mark;
--   EX-MOCK-CASE-A's 14-day rule: promotions 3 to 5 start 15 days after product 8's rise (1 February), 14 days after product 1's
--   rise and product 21's cut (1 March), and on the day of product 15's rise (1 April), each on the product's last price version;
--   product 21 is in promotions 1 and 4 on one version. No line of a product falls in the days of its new promotion.
-- Beside them: guest orders (customer_id missing); product 15's price falls and rises again (three versions), products 1, 8 and 21
-- change price once; one line on promotion. Lines follow E-103: the list price on the order date, less the promotion's discount
-- (half up). Costs follow voltmarkt's rule (S6-07): the Audio products' cost rises 8% from 2025-07-01, the others keep theirs.
CREATE SCHEMA voltmarkt_edge_win;
CREATE TABLE voltmarkt_edge_win.calendar AS SELECT * FROM voltmarkt.calendar
  WHERE cal_date BETWEEN DATE '2025-01-01' AND DATE '2025-06-30';
CREATE TABLE voltmarkt_edge_win.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_win.stores VALUES
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL),
  (2, 'NL-02', 'Rotterdam', 'NL', 'standard', 'Europe/Amsterdam', DATE '2013-05-15', NULL),
  (15, 'BE-01', 'Brussel', 'BE', 'flagship', 'Europe/Brussels', DATE '2014-09-01', NULL),
  (24, 'LU-01', 'Luxembourg', 'LU', 'flagship', 'Europe/Luxembourg', DATE '2017-11-01', NULL),
  (99, 'WEB-01', 'Online', 'NL', 'web', 'UTC', DATE '2015-01-01', NULL);
CREATE TABLE voltmarkt_edge_win.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_win.categories VALUES
  (1, 'TVs up to 43 inch', 'TV & Video'),
  (2, 'TVs 50-55 inch', 'TV & Video'),
  (15, 'Headphones', 'Audio'),
  (16, 'Earbuds', 'Audio'),
  (17, 'Soundbars', 'Audio'),
  (35, 'Cables', 'Accessories');
CREATE TABLE voltmarkt_edge_win.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_win.products VALUES
  (1, 'VM-000001', 'Vistara Pro 550', 'Vistara', 2, 'TVs 50-55 inch', NULL, 640.00, DATE '2023-04-03'),
  (2, 'VM-000002', 'Lumio Max 552', 'Lumio', 2, 'TVs 50-55 inch', NULL, 640.00, DATE '2023-08-14'),
  (3, 'VM-000003', 'Nordvue One 500', 'Nordvue', 2, 'TVs 50-55 inch', NULL, 420.00, DATE '2022-02-01'),
  (4, 'VM-000004', 'Vistara Neo 551', 'Vistara', 2, 'TVs 50-55 inch', NULL, 420.00, DATE '2024-03-04'),
  (5, 'VM-000005', 'Lumio Air 553', 'Lumio', 2, 'TVs 50-55 inch', NULL, 380.00, NULL),
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
CREATE TABLE voltmarkt_edge_win.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_win.promotions VALUES
  (1, 'P-2025-21', 'June Headphones Days', 'percent_off', DATE '2025-06-02', DATE '2025-06-15', 20.00),
  (2, 'P-2025-22', 'Earbuds Week', 'percent_off', DATE '2025-04-07', DATE '2025-04-13', 15.00),
  (3, 'P-2025-23', 'Earbuds Days', 'percent_off', DATE '2025-02-16', DATE '2025-02-19', 10.00),
  (4, 'P-2025-24', 'Spring Screen and Sound Days', 'percent_off', DATE '2025-03-15', DATE '2025-03-19', 10.00),
  (5, 'P-2025-25', 'Cable Week', 'percent_off', DATE '2025-04-01', DATE '2025-04-06', 25.00);
CREATE TABLE voltmarkt_edge_win.promotion_products AS SELECT * FROM voltmarkt.promotion_products LIMIT 0;
INSERT INTO voltmarkt_edge_win.promotion_products VALUES (1, 20), (1, 21), (2, 6), (3, 8), (4, 1), (4, 21), (5, 15);
CREATE TABLE voltmarkt_edge_win.price_history AS SELECT * FROM voltmarkt.price_history LIMIT 0;
INSERT INTO voltmarkt_edge_win.price_history VALUES
  (1, DATE '2023-04-03', DATE '2025-02-28', 849.00),
  (1, DATE '2025-03-01', NULL, 899.00),
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
CREATE TABLE voltmarkt_edge_win.orders AS SELECT * FROM voltmarkt.orders LIMIT 0;
INSERT INTO voltmarkt_edge_win.orders VALUES
  (1, 3001, 1, TIMESTAMP '2025-01-08 10:00:00', 'store', 'NL'),
  (2, 3002, 15, TIMESTAMP '2025-01-15 14:20:00', 'store', 'BE'),
  (3, NULL, 99, TIMESTAMP '2025-01-20 19:30:00', 'web', 'NL'),
  (4, 3004, 2, TIMESTAMP '2025-01-27 11:15:00', 'store', 'NL'),
  (5, 3001, 1, TIMESTAMP '2025-02-14 09:30:00', 'store', 'NL'),
  (6, 3003, 1, TIMESTAMP '2025-02-14 16:45:00', 'store', 'NL'),
  (7, 3002, 99, TIMESTAMP '2025-02-20 20:10:00', 'web', 'BE'),
  (8, NULL, 15, TIMESTAMP '2025-02-22 12:00:00', 'store', 'BE'),
  (9, 3005, 24, TIMESTAMP '2025-03-05 10:40:00', 'store', 'LU'),
  (10, 3001, 1, TIMESTAMP '2025-03-12 15:00:00', 'store', 'NL'),
  (11, 3006, 99, TIMESTAMP '2025-03-20 08:05:00', 'web', 'NL'),
  (12, NULL, 99, TIMESTAMP '2025-03-28 22:10:00', 'web', 'NL'),
  (13, 3002, 15, TIMESTAMP '2025-05-06 11:30:00', 'store', 'BE'),
  (14, 3004, 2, TIMESTAMP '2025-05-15 13:00:00', 'store', 'NL'),
  (15, 3005, 99, TIMESTAMP '2025-05-22 18:00:00', 'web', 'LU'),
  (16, 3001, 1, TIMESTAMP '2025-06-10 17:20:00', 'store', 'NL'),
  (17, 3001, 99, TIMESTAMP '2025-06-10 17:20:00', 'web', 'NL'),
  (18, 3004, 2, TIMESTAMP '2025-06-10 10:30:00', 'store', 'NL'),
  (19, 3002, 99, TIMESTAMP '2025-06-21 09:00:00', 'web', 'BE'),
  (20, 3002, 15, TIMESTAMP '2025-06-21 09:00:00', 'store', 'BE');
CREATE TABLE voltmarkt_edge_win.order_lines AS SELECT * FROM voltmarkt.order_lines LIMIT 0;
INSERT INTO voltmarkt_edge_win.order_lines VALUES
  (1, 1, 15, 2, 12.99, NULL, 0.00),
  (2, 1, 11, 1, 349.00, NULL, 0.00),
  (3, 2, 3, 1, 599.00, NULL, 0.00),
  (4, 2, 6, 1, 179.00, NULL, 0.00),
  (5, 3, 16, 2, 9.99, NULL, 0.00),
  (6, 3, 18, 2, 7.99, NULL, 0.00),
  (7, 4, 20, 1, 199.00, NULL, 0.00),
  (8, 5, 2, 1, 899.00, NULL, 0.00),
  (9, 5, 9, 2, 69.00, NULL, 0.00),
  (10, 6, 13, 2, 299.00, NULL, 0.00),
  (11, 7, 8, 2, 69.00, NULL, 0.00),
  (12, 11, 12, 1, 299.00, NULL, 0.00),
  (13, 8, 17, 2, 9.99, NULL, 0.00),
  (14, 8, 10, 1, 59.00, NULL, 0.00),
  (15, 9, 1, 1, 899.00, NULL, 0.00),
  (16, 9, 19, 1, 299.00, NULL, 0.00),
  (17, 10, 4, 2, 599.00, NULL, 0.00),
  (18, 10, 14, 1, 249.00, NULL, 0.00),
  (19, 11, 3, 1, 599.00, NULL, 0.00),
  (20, 11, 5, 1, 499.00, NULL, 0.00),
  (21, 11, 21, 1, 129.00, NULL, 0.00),
  (22, 12, 16, 2, 9.99, NULL, 0.00),
  (23, 12, 17, 2, 9.99, NULL, 0.00),
  (24, 13, 7, 1, 179.00, NULL, 0.00),
  (25, 13, 12, 1, 299.00, NULL, 0.00),
  (26, 14, 1, 1, 899.00, NULL, 0.00),
  (27, 14, 6, 1, 179.00, NULL, 0.00),
  (28, 14, 22, 3, 89.00, NULL, 0.00),
  (29, 15, 15, 2, 12.99, NULL, 0.00),
  (30, 15, 11, 1, 349.00, NULL, 0.00),
  (31, 15, 10, 1, 59.00, NULL, 0.00),
  (32, 16, 2, 1, 899.00, NULL, 0.00),
  (33, 16, 9, 1, 69.00, NULL, 0.00),
  (34, 17, 7, 1, 179.00, NULL, 0.00),
  (35, 17, 8, 1, 69.00, NULL, 0.00),
  (36, 18, 21, 1, 129.00, 1, 25.80),
  (37, 19, 19, 1, 299.00, NULL, 0.00),
  (38, 20, 20, 1, 199.00, NULL, 0.00),
  (39, 13, 19, 1, 299.00, NULL, 0.00),
  (40, 11, 20, 2, 199.00, NULL, 0.00),
  (41, 11, 22, 3, 89.00, NULL, 0.00);
CREATE TABLE voltmarkt_edge_win.competitor_prices AS SELECT * FROM voltmarkt.competitor_prices LIMIT 0;
INSERT INTO voltmarkt_edge_win.competitor_prices VALUES
  (1, 'Bliksem', TIMESTAMP '2025-03-03 06:10:00', 879.99),
  (1, 'Stroomhuis', TIMESTAMP '2025-05-12 07:00:00', 889.99),
  (1, 'Bliksem', TIMESTAMP '2025-05-12 07:00:00', 869.99),
  (6, 'Bliksem', TIMESTAMP '2025-02-10 06:30:00', 169.99),
  (6, 'Stroomhuis', TIMESTAMP '2025-06-02 06:45:00', 174.99),
  (6, 'Bliksem', TIMESTAMP '2025-06-02 06:45:00', 172.99),
  (11, 'Stroomhuis', TIMESTAMP '2025-01-13 07:20:00', 339.99);
CREATE TABLE voltmarkt_edge_win.ab_assignments AS SELECT * FROM voltmarkt.ab_assignments LIMIT 0;
INSERT INTO voltmarkt_edge_win.ab_assignments VALUES
  ('AB-2025-01', 3001, 'control', TIMESTAMP '2025-03-01 10:00:00'),
  ('AB-2025-01', 3002, 'treatment', TIMESTAMP '2025-03-02 11:00:00'),
  ('AB-2025-01', 3005, 'treatment', TIMESTAMP '2025-03-03 09:00:00');
CREATE TABLE voltmarkt_edge_win.ab_conversions AS SELECT * FROM voltmarkt.ab_conversions LIMIT 0;
INSERT INTO voltmarkt_edge_win.ab_conversions VALUES
  ('AB-2025-01', 3005, TIMESTAMP '2025-03-05 10:40:00', 1198.00);
CREATE TABLE voltmarkt_edge_win.cost_history AS SELECT * FROM voltmarkt.cost_history LIMIT 0;
INSERT INTO voltmarkt_edge_win.cost_history VALUES
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

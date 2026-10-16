-- pipeline/edge/voltmarkt_edge_interval.sql (family: SQL-DATE-02; ERR-LOG-34, ERR-LOG-06)
-- Sprint 6 (S6-04): the level 4 date arithmetic cases, with every voltmarkt table name; the build adds the sales and weekly
-- competitor price views. Planted:
--   a one-day promotion: P-2024-07 runs on 29 February 2024 only (start equals end: 0 days apart, 1 day long), with sales
--   that day;
--   31 January plus one month: orders on 31 January 2024 and 2025, one month on from which is 29 February 2024 and
--   28 February 2025, both days with orders; a promotion that starts on 31 January 2025;
--   29 February 2024: orders that day, and a product launched that day;
--   a date difference across a year end: P-2024-30 runs from 23 December 2024 to 5 January 2025 (one year boundary in 13
--   days); orders on 31 December 2024 and 1 January 2025 by one customer; a product launched on 31 December 2024 that first
--   sells on 1 January 2025; a list price that changes on 1 January 2025;
--   orders on 5, 6 and 7 December 2025, either side of 30 days before the as-of date (2026-01-05), and on 31 December 2025;
--   an A/B conversion 45 minutes after its assignment, on the next day.
-- Line prices follow E-103: the list price on the order date, less the promotion's discount (half up).
-- F2 C2: the calendar holds every day from 31 January 2024 to 31 December 2025, as voltmarkt's holds every day of its span, so
-- a promotion's days or an order's date counted through the calendar give what date arithmetic gives; weekly_units (F2 C1)
-- gets each ISO week of the span.
CREATE SCHEMA voltmarkt_edge_interval;
CREATE TABLE voltmarkt_edge_interval.calendar AS SELECT * FROM voltmarkt.calendar
  WHERE cal_date BETWEEN DATE '2024-01-31' AND DATE '2025-12-31';
CREATE TABLE voltmarkt_edge_interval.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_interval.stores VALUES
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL),
  (15, 'BE-01', 'Brussel', 'BE', 'flagship', 'Europe/Brussels', DATE '2014-09-01', NULL),
  (99, 'WEB-01', 'Online', 'NL', 'web', 'UTC', DATE '2015-01-01', NULL);
CREATE TABLE voltmarkt_edge_interval.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_interval.categories VALUES
  (2, 'TVs 50-55 inch', 'TV & Video'),
  (16, 'Earbuds', 'Audio'),
  (35, 'Cables', 'Accessories');
CREATE TABLE voltmarkt_edge_interval.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_interval.products VALUES
  (1, 'VM-000001', 'Vistara Pro 550', 'Vistara', 2, 'TVs 50-55 inch', NULL, 640.00, DATE '2023-04-03'),
  (2, 'VM-000002', 'Sonora Pro 311', 'Sonora', 16, 'Earbuds', 3, 99.00, DATE '2023-09-18'),
  (3, 'VM-000003', 'Sonora Lite 312', 'Sonora', 16, 'Earbuds', 2, 39.00, DATE '2022-03-14'),
  (4, 'VM-000004', 'Cablemate One 200', 'Cablemate', 35, 'Cables', NULL, 5.00, DATE '2024-02-29'),
  (5, 'VM-000005', 'Basswell Air 140', 'Basswell', 16, 'Earbuds', NULL, 45.00, DATE '2024-12-31');
CREATE TABLE voltmarkt_edge_interval.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_interval.promotions VALUES
  (1, 'P-2024-07', 'Leap Day Deal', 'percent_off', DATE '2024-02-29', DATE '2024-02-29', 10.00),
  (2, 'P-2024-30', 'Year End Clearance', 'clearance', DATE '2024-12-23', DATE '2025-01-05', 30.00),
  (3, 'P-2025-02', 'January Close', 'percent_off', DATE '2025-01-31', DATE '2025-02-13', 15.00),
  (4, 'P-2025-31', 'December Audio Days', 'percent_off', DATE '2025-12-01', DATE '2025-12-14', 20.00);
CREATE TABLE voltmarkt_edge_interval.promotion_products AS SELECT * FROM voltmarkt.promotion_products LIMIT 0;
INSERT INTO voltmarkt_edge_interval.promotion_products VALUES (1, 2), (2, 4), (3, 3), (4, 2);
CREATE TABLE voltmarkt_edge_interval.price_history AS SELECT * FROM voltmarkt.price_history LIMIT 0;
INSERT INTO voltmarkt_edge_interval.price_history VALUES
  (1, DATE '2023-04-03', NULL, 899.00),
  (2, DATE '2023-09-18', DATE '2024-12-31', 179.00),
  (2, DATE '2025-01-01', NULL, 169.00),
  (3, DATE '2022-03-14', NULL, 69.00),
  (4, DATE '2024-02-29', NULL, 12.99),
  (5, DATE '2024-12-31', NULL, 79.00);
CREATE TABLE voltmarkt_edge_interval.orders AS SELECT * FROM voltmarkt.orders LIMIT 0;
INSERT INTO voltmarkt_edge_interval.orders VALUES
  (1, 6001, 1, TIMESTAMP '2024-01-31 10:00:00', 'store', 'NL'),
  (2, 6002, 15, TIMESTAMP '2024-02-29 11:00:00', 'store', 'BE'),
  (3, NULL, 99, TIMESTAMP '2024-02-29 15:30:00', 'web', 'NL'),
  (4, 6001, 1, TIMESTAMP '2024-03-01 09:30:00', 'store', 'NL'),
  (5, 6003, 15, TIMESTAMP '2024-12-31 16:00:00', 'store', 'BE'),
  (6, 6003, 99, TIMESTAMP '2025-01-01 12:00:00', 'web', 'BE'),
  (7, 6004, 1, TIMESTAMP '2025-01-31 14:00:00', 'store', 'NL'),
  (8, 6004, 1, TIMESTAMP '2025-02-28 10:30:00', 'store', 'NL'),
  (9, 6005, 99, TIMESTAMP '2025-12-05 10:00:00', 'web', 'NL'),
  (10, 6005, 99, TIMESTAMP '2025-12-06 11:00:00', 'web', 'LU'),
  (11, 6006, 1, TIMESTAMP '2025-12-07 13:00:00', 'store', 'NL'),
  (12, 6002, 15, TIMESTAMP '2025-12-31 18:00:00', 'store', 'BE');
CREATE TABLE voltmarkt_edge_interval.order_lines AS SELECT * FROM voltmarkt.order_lines LIMIT 0;
INSERT INTO voltmarkt_edge_interval.order_lines VALUES
  (1, 1, 1, 1, 899.00, NULL, 0.00),
  (2, 2, 2, 1, 179.00, 1, 17.90),
  (3, 2, 4, 2, 12.99, NULL, 0.00),
  (4, 3, 2, 1, 179.00, 1, 17.90),
  (5, 4, 3, 1, 69.00, NULL, 0.00),
  (6, 5, 4, 3, 12.99, 2, 11.69),
  (7, 5, 1, 1, 899.00, NULL, 0.00),
  (8, 6, 5, 1, 79.00, NULL, 0.00),
  (9, 6, 4, 1, 12.99, 2, 3.90),
  (10, 7, 3, 2, 69.00, 3, 20.70),
  (11, 8, 3, 1, 69.00, NULL, 0.00),
  (12, 9, 2, 1, 169.00, 4, 33.80),
  (13, 10, 2, 1, 169.00, 4, 33.80),
  (14, 10, 5, 2, 79.00, NULL, 0.00),
  (15, 11, 3, 1, 69.00, NULL, 0.00),
  (16, 12, 1, 1, 899.00, NULL, 0.00),
  (17, 12, 2, 1, 169.00, NULL, 0.00);
CREATE TABLE voltmarkt_edge_interval.competitor_prices AS SELECT * FROM voltmarkt.competitor_prices LIMIT 0;
INSERT INTO voltmarkt_edge_interval.competitor_prices VALUES
  (2, 'Bliksem', TIMESTAMP '2024-02-29 06:15:00', 169.99),
  (2, 'Stroomhuis', TIMESTAMP '2025-01-01 07:05:00', 174.99);
CREATE TABLE voltmarkt_edge_interval.ab_assignments AS SELECT * FROM voltmarkt.ab_assignments LIMIT 0;
INSERT INTO voltmarkt_edge_interval.ab_assignments VALUES
  ('AB-2025-01', 6001, 'control', TIMESTAMP '2025-09-01 23:30:00'),
  ('AB-2025-01', 6004, 'treatment', TIMESTAMP '2025-09-07 22:10:00');
CREATE TABLE voltmarkt_edge_interval.ab_conversions AS SELECT * FROM voltmarkt.ab_conversions LIMIT 0;
INSERT INTO voltmarkt_edge_interval.ab_conversions VALUES
  ('AB-2025-01', 6001, TIMESTAMP '2025-09-02 00:15:00', 69.00);
-- Costs follow voltmarkt's rule (S6-07): the Audio products' cost rises 8% from 2025-07-01, the others keep theirs.
CREATE TABLE voltmarkt_edge_interval.cost_history AS SELECT * FROM voltmarkt.cost_history LIMIT 0;
INSERT INTO voltmarkt_edge_interval.cost_history VALUES
  (1, DATE '2023-04-03', NULL, 640.00),
  (2, DATE '2023-09-18', DATE '2025-06-30', 99.00),
  (2, DATE '2025-07-01', NULL, 106.92),
  (3, DATE '2022-03-14', DATE '2025-06-30', 39.00),
  (3, DATE '2025-07-01', NULL, 42.12),
  (4, DATE '2024-02-29', NULL, 5.00),
  (5, DATE '2024-12-31', DATE '2025-06-30', 45.00),
  (5, DATE '2025-07-01', NULL, 48.60);

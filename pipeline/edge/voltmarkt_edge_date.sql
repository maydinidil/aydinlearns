-- pipeline/edge/voltmarkt_edge_date.sql (family: SQL-DATE-01)
-- Sprint 4a (S4-03): the level 3 date cases, with every voltmarkt table name; the build adds the sales view
-- (pipeline/voltmarkt/ddl.sql). The webshop (store 99, WEB-01) has time zone UTC in stores; the stores have
-- Europe/Amsterdam or Europe/Brussels, one hour ahead of UTC in winter and two in summer. Planted:
--   web orders at 23:30 UTC on 2024-02-29, 2024-12-31, 2025-01-31, 2025-06-30 (summer time), 2025-10-25,
--   2025-10-26 and 2025-12-31: each falls on the next day in Amsterdam, and the last one on 2026-01-01, a day
--   the calendar does not have;
--   the clock change on Sunday 2025-10-26: web orders at 00:30 and 01:30 UTC both read 02:30 in Amsterdam,
--   beside a store order that day and the late orders of 25 and 26 October;
--   orders after midnight on month ends: 2024-02-29 (a leap day), 2024-12-31, 2025-01-31, 2025-06-30 and
--   2025-12-31;
--   ISO week 1 across a year: 30 and 31 December 2024 are in week 1 of ISO year 2025, and 29 and
--   31 December 2025 in week 1 of ISO year 2026, beside 29 December 2024 and 28 December 2025 (week 52) and
--   1 and 5 January 2025 (week 1);
--   a promotion from 2024-12-23 to 2025-01-05 and one that ends on 2025-06-30; list prices that change on
--   2025-01-01 and 2025-07-01, so a 23:30 UTC line carries the price of its UTC date;
--   competitor prices checked at 23:30 UTC and during the clock change.
-- Line prices follow E-103 on the order's own date: the list price, less the promotion's discount (half up).
CREATE SCHEMA voltmarkt_edge_date;
CREATE TABLE voltmarkt_edge_date.calendar AS SELECT * FROM voltmarkt.calendar WHERE cal_date IN (
  DATE '2024-02-28', DATE '2024-02-29', DATE '2024-03-01', DATE '2024-12-29', DATE '2024-12-30', DATE '2024-12-31',
  DATE '2025-01-01', DATE '2025-01-05', DATE '2025-01-31', DATE '2025-02-01', DATE '2025-06-30', DATE '2025-07-01',
  DATE '2025-10-25', DATE '2025-10-26', DATE '2025-10-27', DATE '2025-12-28', DATE '2025-12-29', DATE '2025-12-31');
CREATE TABLE voltmarkt_edge_date.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_date.stores VALUES
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL),
  (15, 'BE-01', 'Brussel', 'BE', 'flagship', 'Europe/Brussels', DATE '2014-09-01', NULL),
  (99, 'WEB-01', 'Online', 'NL', 'web', 'UTC', DATE '2015-01-01', NULL);
CREATE TABLE voltmarkt_edge_date.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_date.categories VALUES
  (1, 'TVs up to 43 inch', 'TV & Video'),
  (16, 'Earbuds', 'Audio'),
  (35, 'Cables', 'Accessories');
CREATE TABLE voltmarkt_edge_date.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_date.products VALUES
  (1, 'VM-000001', 'Vistara One 432', 'Vistara', 1, 'TVs up to 43 inch', NULL, 230.00, DATE '2023-03-06'),
  (2, 'VM-000002', 'Sonora Air 120', 'Sonora', 16, 'Earbuds', NULL, 47.00, DATE '2023-02-01'),
  (3, 'VM-000003', 'Cablemate One 200', 'Cablemate', 35, 'Cables', NULL, 5.00, DATE '2022-06-01');
CREATE TABLE voltmarkt_edge_date.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_date.promotions VALUES
  (1, 'P-2024-30', 'Winter Sale', 'percent_off', DATE '2024-12-23', DATE '2025-01-05', 20.00),
  (2, 'P-2025-16', 'June TV Days', 'percent_off', DATE '2025-06-17', DATE '2025-06-30', 15.00);
CREATE TABLE voltmarkt_edge_date.promotion_products AS SELECT * FROM voltmarkt.promotion_products LIMIT 0;
INSERT INTO voltmarkt_edge_date.promotion_products VALUES (1, 1), (1, 2), (2, 1);
CREATE TABLE voltmarkt_edge_date.price_history AS SELECT * FROM voltmarkt.price_history LIMIT 0;
INSERT INTO voltmarkt_edge_date.price_history VALUES
  (1, DATE '2023-03-06', DATE '2024-12-31', 299.00),
  (1, DATE '2025-01-01', NULL, 279.00),
  (2, DATE '2023-02-01', DATE '2025-06-30', 86.00),
  (2, DATE '2025-07-01', NULL, 79.00),
  (3, DATE '2022-06-01', NULL, 12.99);
CREATE TABLE voltmarkt_edge_date.orders AS SELECT * FROM voltmarkt.orders LIMIT 0;
INSERT INTO voltmarkt_edge_date.orders VALUES
  (1, 2001, 99, TIMESTAMP '2024-02-29 23:30:00', 'web', 'NL'),
  (2, 2002, 1, TIMESTAMP '2024-02-29 14:00:00', 'store', 'NL'),
  (3, 2003, 99, TIMESTAMP '2024-12-29 10:00:00', 'web', 'BE'),
  (4, 2001, 99, TIMESTAMP '2024-12-30 09:00:00', 'web', 'NL'),
  (5, NULL, 1, TIMESTAMP '2024-12-31 16:45:00', 'store', 'NL'),
  (6, 2004, 99, TIMESTAMP '2024-12-31 23:30:00', 'web', 'NL'),
  (7, NULL, 99, TIMESTAMP '2025-01-01 00:15:00', 'web', 'BE'),
  (8, 2005, 15, TIMESTAMP '2025-01-05 13:00:00', 'store', 'BE'),
  (9, 2003, 99, TIMESTAMP '2025-01-31 23:30:00', 'web', 'BE'),
  (10, 2002, 1, TIMESTAMP '2025-01-31 18:00:00', 'store', 'NL'),
  (11, 2001, 99, TIMESTAMP '2025-06-30 23:30:00', 'web', 'NL'),
  (12, 2004, 99, TIMESTAMP '2025-10-25 23:30:00', 'web', 'NL'),
  (13, NULL, 99, TIMESTAMP '2025-10-26 00:30:00', 'web', 'NL'),
  (14, 2003, 99, TIMESTAMP '2025-10-26 01:30:00', 'web', 'BE'),
  (15, 2001, 99, TIMESTAMP '2025-10-26 23:30:00', 'web', 'NL'),
  (16, 2002, 1, TIMESTAMP '2025-10-26 12:00:00', 'store', 'NL'),
  (17, 2004, 99, TIMESTAMP '2025-12-28 22:00:00', 'web', 'NL'),
  (18, 2003, 99, TIMESTAMP '2025-12-29 10:00:00', 'web', 'BE'),
  (19, NULL, 1, TIMESTAMP '2025-12-31 17:00:00', 'store', 'NL'),
  (20, 2001, 99, TIMESTAMP '2025-12-31 23:30:00', 'web', 'NL');
CREATE TABLE voltmarkt_edge_date.order_lines AS SELECT * FROM voltmarkt.order_lines LIMIT 0;
INSERT INTO voltmarkt_edge_date.order_lines VALUES
  (1, 1, 2, 1, 86.00, NULL, 0.00),
  (2, 2, 3, 2, 12.99, NULL, 0.00),
  (3, 3, 1, 1, 299.00, 1, 59.80),
  (4, 4, 2, 1, 86.00, 1, 17.20),
  (5, 5, 1, 1, 299.00, 1, 59.80),
  (6, 5, 3, 1, 12.99, NULL, 0.00),
  (7, 6, 1, 1, 299.00, 1, 59.80),
  (8, 7, 1, 1, 279.00, 1, 55.80),
  (9, 8, 2, 2, 86.00, 1, 34.40),
  (10, 9, 3, 3, 12.99, NULL, 0.00),
  (11, 10, 2, 1, 86.00, NULL, 0.00),
  (12, 11, 1, 1, 279.00, 2, 41.85),
  (13, 11, 2, 1, 86.00, NULL, 0.00),
  (14, 12, 3, 1, 12.99, NULL, 0.00),
  (15, 13, 2, 1, 79.00, NULL, 0.00),
  (16, 14, 3, 2, 12.99, NULL, 0.00),
  (17, 15, 1, 1, 279.00, NULL, 0.00),
  (18, 16, 2, 1, 79.00, NULL, 0.00),
  (19, 17, 3, 1, 12.99, NULL, 0.00),
  (20, 18, 1, 1, 279.00, NULL, 0.00),
  (21, 19, 2, 1, 79.00, NULL, 0.00),
  (22, 20, 3, 4, 12.99, NULL, 0.00);
CREATE TABLE voltmarkt_edge_date.competitor_prices AS SELECT * FROM voltmarkt.competitor_prices LIMIT 0;
INSERT INTO voltmarkt_edge_date.competitor_prices VALUES
  (1, 'Bliksem', TIMESTAMP '2024-12-31 23:30:00', 289.99),
  (1, 'Stroomhuis', TIMESTAMP '2025-01-01 06:10:00', 289.99),
  (2, 'Bliksem', TIMESTAMP '2025-06-30 23:30:00', 82.99),
  (2, 'Stroomhuis', TIMESTAMP '2025-10-26 00:30:00', 81.99),
  (2, 'Bliksem', TIMESTAMP '2025-10-26 01:30:00', 76.99),
  (3, 'Stroomhuis', TIMESTAMP '2025-12-29 07:00:00', 12.99);

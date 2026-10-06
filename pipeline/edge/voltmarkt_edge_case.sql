-- pipeline/edge/voltmarkt_edge_case.sql (family: SQL-CASE-01, ERR-LOG-13, ERR-LOG-15, ERR-SEM-04)
-- The order data the level 2 CASE items read through the sales view, which the build adds
-- (pipeline/voltmarkt/ddl.sql). Planted, by net revenue of the lines below:
--   lines worth exactly 50.00 (one of them 4 cables at 12.50), 100.00 and 500.00, and lines just
--   under them (49.99, 99.99, 499.00), so >= against > and band order show;
--   line 11 has no quantity (units and net revenue missing), line 12 no unit price (net revenue
--   missing), product 4 no unit cost: no band condition matches a missing value;
--   products by net revenue: 500.00, 499.00, then 200.00 twice (a tie at the top-3 cutoff);
--   categories by lines: Earbuds 5, then Cables and Memory Cards 3 (a tie at the top-2 cutoff);
--   web orders ship to NL, BE and LU; NL-06 sells nothing in April and sells on its last open day;
--   2025-03-31, 04-30, 05-31 and 06-30 are month ends; 2025-04-01 and 06-01 fall in ISO weeks that
--   start in the previous month.
CREATE SCHEMA voltmarkt_edge_case;
CREATE TABLE voltmarkt_edge_case.calendar AS SELECT * FROM voltmarkt.calendar WHERE cal_date IN (
  DATE '2025-03-31', DATE '2025-04-01', DATE '2025-04-05', DATE '2025-04-12', DATE '2025-04-30', DATE '2025-05-02',
  DATE '2025-05-17', DATE '2025-05-31', DATE '2025-06-01', DATE '2025-06-30');
CREATE TABLE voltmarkt_edge_case.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_case.stores VALUES
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL),
  (6, 'NL-06', 'Zwolle', 'NL', 'standard', 'Europe/Amsterdam', DATE '2016-10-01', DATE '2025-06-30'),
  (15, 'BE-01', 'Brussel', 'BE', 'flagship', 'Europe/Brussels', DATE '2014-09-01', NULL),
  (24, 'LU-01', 'Luxembourg', 'LU', 'flagship', 'Europe/Luxembourg', DATE '2017-11-01', NULL),
  (99, 'WEB-01', 'Online', 'NL', 'web', 'UTC', DATE '2015-01-01', NULL);
CREATE TABLE voltmarkt_edge_case.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_case.categories VALUES
  (1, 'TVs up to 43 inch', 'TV & Video'),
  (15, 'Headphones', 'Audio'),
  (16, 'Earbuds', 'Audio'),
  (17, 'Soundbars', 'Audio'),
  (21, 'Consoles', 'Gaming'),
  (35, 'Cables', 'Accessories'),
  (37, 'Memory Cards', 'Accessories');
CREATE TABLE voltmarkt_edge_case.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_case.products VALUES
  (1, 'VM-000001', 'Vistara One 432', 'Vistara', 1, 'TVs up to 43 inch', NULL, 380.00, DATE '2023-03-06'),
  (2, 'VM-000002', 'Basswell Pro 410', 'Basswell', 15, 'Headphones', NULL, 60.00, DATE '2023-05-01'),
  (3, 'VM-000003', 'Sonora Air 120', 'Sonora', 16, 'Earbuds', NULL, 30.00, DATE '2023-02-01'),
  (4, 'VM-000004', 'Sonora Lite 130', 'Sonora', 16, 'Earbuds', NULL, NULL, DATE '2024-02-01'),
  (5, 'VM-000005', 'PlayBox 5', 'PlayBox', 21, 'Consoles', NULL, 415.00, DATE '2021-11-19'),
  (6, 'VM-000006', 'Cablemate One 200', 'Cablemate', 35, 'Cables', NULL, 4.00, DATE '2022-06-01'),
  (7, 'VM-000007', 'Energo Go 310', 'Energo', 37, 'Memory Cards', NULL, 21.00, DATE '2022-09-01'),
  (8, 'VM-000008', 'Echoline Go 983', 'Echoline', 17, 'Soundbars', NULL, 35.00, DATE '2023-10-30');
CREATE TABLE voltmarkt_edge_case.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_case.promotions VALUES
  (1, 'P-2025-20', 'June Clearance', 'clearance', DATE '2025-05-26', DATE '2025-06-08', 30.00);
CREATE TABLE voltmarkt_edge_case.promotion_products AS SELECT * FROM voltmarkt.promotion_products LIMIT 0;
INSERT INTO voltmarkt_edge_case.promotion_products VALUES (1, 8);
CREATE TABLE voltmarkt_edge_case.price_history AS SELECT * FROM voltmarkt.price_history LIMIT 0;
INSERT INTO voltmarkt_edge_case.price_history VALUES
  (1, DATE '2023-03-06', NULL, 500.00),
  (2, DATE '2023-05-01', NULL, 100.00),
  (3, DATE '2023-02-01', NULL, 50.00),
  (4, DATE '2024-02-01', NULL, 99.99),
  (5, DATE '2021-11-19', NULL, 499.00),
  (6, DATE '2022-06-01', NULL, 12.50),
  (7, DATE '2022-09-01', NULL, 25.00),
  (8, DATE '2023-10-30', NULL, 49.99);
CREATE TABLE voltmarkt_edge_case.orders AS SELECT * FROM voltmarkt.orders LIMIT 0;
INSERT INTO voltmarkt_edge_case.orders VALUES
  (1, 2001, 1, TIMESTAMP '2025-03-31 18:00:00', 'store', 'NL'),
  (2, NULL, 99, TIMESTAMP '2025-04-01 09:30:00', 'web', 'LU'),
  (3, 2002, 15, TIMESTAMP '2025-04-05 14:00:00', 'store', 'BE'),
  (4, 2003, 24, TIMESTAMP '2025-04-12 11:00:00', 'store', 'LU'),
  (5, NULL, 99, TIMESTAMP '2025-04-30 23:30:00', 'web', 'BE'),
  (6, 2004, 1, TIMESTAMP '2025-05-02 16:45:00', 'store', 'NL'),
  (7, 2005, 6, TIMESTAMP '2025-05-17 12:10:00', 'store', 'NL'),
  (8, 2006, 15, TIMESTAMP '2025-05-31 10:00:00', 'store', 'BE'),
  (9, NULL, 99, TIMESTAMP '2025-06-01 20:00:00', 'web', 'NL'),
  (10, 2007, 6, TIMESTAMP '2025-06-30 17:30:00', 'store', 'NL');
CREATE TABLE voltmarkt_edge_case.order_lines AS SELECT * FROM voltmarkt.order_lines LIMIT 0;
INSERT INTO voltmarkt_edge_case.order_lines VALUES
  (1, 1, 1, 1, 500.00, NULL, 0.00),
  (2, 1, 6, 4, 12.50, NULL, 0.00),
  (3, 2, 2, 1, 100.00, NULL, 0.00),
  (4, 3, 3, 1, 50.00, NULL, 0.00),
  (5, 3, 8, 1, 49.99, NULL, 0.00),
  (6, 4, 4, 1, 99.99, NULL, 0.00),
  (7, 5, 5, 1, 499.00, NULL, 0.00),
  (8, 6, 2, 1, 100.00, NULL, 0.00),
  (9, 6, 7, 2, 25.00, NULL, 0.00),
  (10, 7, 3, 2, 50.00, NULL, 0.00),
  (11, 8, 6, NULL, 12.50, NULL, 0.00),
  (12, 8, 7, 1, NULL, NULL, 0.00),
  (13, 9, 8, 2, 49.99, 1, 29.99),
  (14, 10, 4, 1, 99.99, NULL, 0.00),
  (15, 10, 3, 1, 50.00, NULL, 0.00),
  (16, 4, 6, 2, 12.50, NULL, 0.00),
  (17, 7, 7, 1, 25.00, NULL, 0.00);

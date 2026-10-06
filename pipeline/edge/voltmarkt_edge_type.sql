-- pipeline/edge/voltmarkt_edge_type.sql (family: SQL-TYPE-01, ERR-LOG-21, CHK-INT-TRUNC, E-055)
-- The order data the level 2 type items read through the sales view, which the build adds
-- (pipeline/voltmarkt/ddl.sql). Planted, by units and net revenue of the lines below:
--   units per line by store: BE-01 26 over 3 lines (8.67: CAST to INTEGER gives 9, integer division
--   gives 8), NL-01 6 over 2 and WEB-01 9 over 3 (3.0 each, a tie at the top-2 cutoff), LU-01 7 over
--   3 (2.33), NL-06 1 over 1 line with units plus a line with none;
--   products by net revenue: 1200.00, 480.00, then 230.00 twice (a tie at the top-3 cutoff);
--   product 2's margin is exactly 15% of its net revenue (0.15 against 15), product 3's is 12.5%
--   (a half to round); promotion 1's discount is stored as 15.00 percent;
--   line 13 has no quantity (units and net revenue missing), line 11 no unit price (net revenue
--   missing), product 5 no unit cost; NL-06 sells in June only;
--   2025-06-30, 09-30, 10-31, 11-30 and 12-31 are month ends; 2025-10-01 and 11-01 fall in ISO
--   weeks that start in the previous month.
CREATE SCHEMA voltmarkt_edge_type;
CREATE TABLE voltmarkt_edge_type.calendar AS SELECT * FROM voltmarkt.calendar WHERE cal_date IN (
  DATE '2025-06-30', DATE '2025-09-30', DATE '2025-10-01', DATE '2025-10-15', DATE '2025-10-31', DATE '2025-11-01',
  DATE '2025-11-15', DATE '2025-11-30', DATE '2025-12-01', DATE '2025-12-31');
CREATE TABLE voltmarkt_edge_type.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_type.stores VALUES
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL),
  (6, 'NL-06', 'Zwolle', 'NL', 'standard', 'Europe/Amsterdam', DATE '2016-10-01', DATE '2025-06-30'),
  (15, 'BE-01', 'Brussel', 'BE', 'flagship', 'Europe/Brussels', DATE '2014-09-01', NULL),
  (24, 'LU-01', 'Luxembourg', 'LU', 'flagship', 'Europe/Luxembourg', DATE '2017-11-01', NULL),
  (99, 'WEB-01', 'Online', 'NL', 'web', 'UTC', DATE '2015-01-01', NULL);
CREATE TABLE voltmarkt_edge_type.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_type.categories VALUES
  (1, 'TVs up to 43 inch', 'TV & Video'),
  (15, 'Headphones', 'Audio'),
  (16, 'Earbuds', 'Audio'),
  (35, 'Cables', 'Accessories'),
  (36, 'Batteries', 'Accessories'),
  (37, 'Memory Cards', 'Accessories');
CREATE TABLE voltmarkt_edge_type.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_type.products VALUES
  (1, 'VM-000001', 'Cablemate One 200', 'Cablemate', 35, 'Cables', NULL, 2.00, DATE '2022-06-01'),
  (2, 'VM-000002', 'Energo Go 310', 'Energo', 37, 'Memory Cards', NULL, 8.50, DATE '2022-09-01'),
  (3, 'VM-000003', 'Sonora Air 120', 'Sonora', 16, 'Earbuds', NULL, 70.00, DATE '2023-02-01'),
  (4, 'VM-000004', 'Vistara One 432', 'Vistara', 1, 'TVs up to 43 inch', NULL, 240.00, DATE '2023-03-06'),
  (5, 'VM-000005', 'Basswell Pro 410', 'Basswell', 15, 'Headphones', NULL, NULL, DATE '2023-05-01'),
  (6, 'VM-000006', 'Energo Max 615', 'Energo', 36, 'Batteries', NULL, 1.20, DATE '2021-04-12');
CREATE TABLE voltmarkt_edge_type.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_type.promotions VALUES
  (1, 'P-2025-22', 'August Audio Days', 'percent_off', DATE '2025-08-04', DATE '2025-08-17', 15.00);
CREATE TABLE voltmarkt_edge_type.promotion_products AS SELECT * FROM voltmarkt.promotion_products LIMIT 0;
INSERT INTO voltmarkt_edge_type.promotion_products VALUES (1, 3);
CREATE TABLE voltmarkt_edge_type.price_history AS SELECT * FROM voltmarkt.price_history LIMIT 0;
INSERT INTO voltmarkt_edge_type.price_history VALUES
  (1, DATE '2022-06-01', NULL, 4.00),
  (2, DATE '2022-09-01', NULL, 10.00),
  (3, DATE '2023-02-01', NULL, 80.00),
  (4, DATE '2023-03-06', NULL, 300.00),
  (5, DATE '2023-05-01', NULL, 115.00),
  (6, DATE '2021-04-12', NULL, 1.50);
CREATE TABLE voltmarkt_edge_type.orders AS SELECT * FROM voltmarkt.orders LIMIT 0;
INSERT INTO voltmarkt_edge_type.orders VALUES
  (1, 3001, 15, TIMESTAMP '2025-09-30 12:00:00', 'store', 'BE'),
  (2, 3002, 15, TIMESTAMP '2025-10-01 10:00:00', 'store', 'BE'),
  (3, 3003, 1, TIMESTAMP '2025-10-15 15:00:00', 'store', 'NL'),
  (4, NULL, 99, TIMESTAMP '2025-10-31 23:59:00', 'web', 'NL'),
  (5, 3004, 24, TIMESTAMP '2025-11-01 11:00:00', 'store', 'LU'),
  (6, 3005, 24, TIMESTAMP '2025-11-15 14:00:00', 'store', 'LU'),
  (7, NULL, 99, TIMESTAMP '2025-11-30 20:00:00', 'web', 'BE'),
  (8, 3006, 1, TIMESTAMP '2025-12-01 09:00:00', 'store', 'NL'),
  (9, 3007, 6, TIMESTAMP '2025-06-30 18:00:00', 'store', 'NL'),
  (10, 3008, 99, TIMESTAMP '2025-12-31 22:00:00', 'web', 'LU');
CREATE TABLE voltmarkt_edge_type.order_lines AS SELECT * FROM voltmarkt.order_lines LIMIT 0;
INSERT INTO voltmarkt_edge_type.order_lines VALUES
  (1, 1, 2, 9, 10.00, NULL, 0.00),
  (2, 2, 2, 9, 10.00, NULL, 0.00),
  (3, 2, 1, 8, 4.00, NULL, 0.00),
  (4, 3, 3, 3, 80.00, NULL, 0.00),
  (5, 8, 4, 3, 300.00, NULL, 0.00),
  (6, 4, 5, 2, 115.00, NULL, 0.00),
  (7, 7, 6, 4, 1.50, NULL, 0.00),
  (8, 10, 3, 3, 80.00, NULL, 0.00),
  (9, 5, 2, 3, 10.00, NULL, 0.00),
  (10, 6, 2, 2, 10.00, NULL, 0.00),
  (11, 6, 6, 2, NULL, NULL, 0.00),
  (12, 9, 4, 1, 300.00, NULL, 0.00),
  (13, 9, 1, NULL, 4.00, NULL, 0.00);

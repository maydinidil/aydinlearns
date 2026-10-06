-- pipeline/edge/voltmarkt_edge_agg.sql (family: SQL-AGG-01 to SQL-AGG-04, ERR-SEM-04, ERR-LOG-01, ERR-LOG-03)
-- The order data the level 2 aggregation items read through the sales view, which the build adds
-- (pipeline/voltmarkt/ddl.sql). Planted, by net revenue and units of the lines below:
--   products by net revenue: 998.00, 553.15, then 258.00 twice (a tie at the top-3 cutoff);
--   stores by units: BE-01 7, then NL-01 and WEB-01 6 (a tie at the top-2 cutoff);
--   line 10 has no quantity (units and net revenue missing), line 14 no unit price (net revenue
--   missing), product 4 no unit cost; LU-01 sells in January only, NL-06 never in March;
--   2024-12-31 23:59:59, 2025-01-31 and 2025-02-28 are month ends; 2025-01-01, 2025-02-01 and
--   2025-03-02 fall in ISO weeks that start in the previous month.
CREATE SCHEMA voltmarkt_edge_agg;
CREATE TABLE voltmarkt_edge_agg.calendar AS SELECT * FROM voltmarkt.calendar WHERE cal_date IN (
  DATE '2024-12-31', DATE '2025-01-01', DATE '2025-01-04', DATE '2025-01-10', DATE '2025-01-31', DATE '2025-02-01',
  DATE '2025-02-10', DATE '2025-02-14', DATE '2025-02-28', DATE '2025-03-02', DATE '2025-03-03');
CREATE TABLE voltmarkt_edge_agg.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_agg.stores VALUES
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL),
  (6, 'NL-06', 'Zwolle', 'NL', 'standard', 'Europe/Amsterdam', DATE '2016-10-01', DATE '2025-06-30'),
  (15, 'BE-01', 'Brussel', 'BE', 'flagship', 'Europe/Brussels', DATE '2014-09-01', NULL),
  (24, 'LU-01', 'Luxembourg', 'LU', 'flagship', 'Europe/Luxembourg', DATE '2017-11-01', NULL),
  (99, 'WEB-01', 'Online', 'NL', 'web', 'UTC', DATE '2015-01-01', NULL);
CREATE TABLE voltmarkt_edge_agg.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_agg.categories VALUES
  (1, 'TVs up to 43 inch', 'TV & Video'),
  (15, 'Headphones', 'Audio'),
  (16, 'Earbuds', 'Audio'),
  (21, 'Consoles', 'Gaming'),
  (35, 'Cables', 'Accessories'),
  (37, 'Memory Cards', 'Accessories');
CREATE TABLE voltmarkt_edge_agg.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_agg.products VALUES
  (1, 'VM-000001', 'Vistara One 432', 'Vistara', 1, 'TVs up to 43 inch', NULL, 230.00, DATE '2023-03-06'),
  (2, 'VM-000002', 'Basswell Pro 410', 'Basswell', 15, 'Headphones', NULL, 70.00, DATE '2023-05-01'),
  (3, 'VM-000003', 'Sonora Air 120', 'Sonora', 16, 'Earbuds', NULL, 47.00, DATE '2023-02-01'),
  (4, 'VM-000004', 'Sonora Lite 130', 'Sonora', 16, 'Earbuds', NULL, NULL, DATE '2024-02-01'),
  (5, 'VM-000005', 'PlayBox 5', 'PlayBox', 21, 'Consoles', NULL, 415.00, DATE '2021-11-19'),
  (6, 'VM-000006', 'Cablemate One 200', 'Cablemate', 35, 'Cables', NULL, 5.00, DATE '2022-06-01'),
  (7, 'VM-000007', 'Energo Go 310', 'Energo', 37, 'Memory Cards', NULL, 11.00, DATE '2022-09-01');
CREATE TABLE voltmarkt_edge_agg.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_agg.promotions VALUES
  (1, 'P-2025-01', 'January Clearance', 'clearance', DATE '2025-01-06', DATE '2025-01-19', 50.00),
  (2, 'P-2025-04', 'February TV Days', 'percent_off', DATE '2025-02-03', DATE '2025-02-16', 15.00);
CREATE TABLE voltmarkt_edge_agg.promotion_products AS SELECT * FROM voltmarkt.promotion_products LIMIT 0;
INSERT INTO voltmarkt_edge_agg.promotion_products VALUES (1, 6), (2, 1);
CREATE TABLE voltmarkt_edge_agg.price_history AS SELECT * FROM voltmarkt.price_history LIMIT 0;
INSERT INTO voltmarkt_edge_agg.price_history VALUES
  (1, DATE '2023-03-06', NULL, 299.00),
  (2, DATE '2023-05-01', NULL, 129.00),
  (3, DATE '2023-02-01', NULL, 86.00),
  (4, DATE '2024-02-01', NULL, 49.00),
  (5, DATE '2021-11-19', NULL, 499.00),
  (6, DATE '2022-06-01', NULL, 12.99),
  (7, DATE '2022-09-01', NULL, 14.99);
CREATE TABLE voltmarkt_edge_agg.orders AS SELECT * FROM voltmarkt.orders LIMIT 0;
INSERT INTO voltmarkt_edge_agg.orders VALUES
  (1, 1001, 1, TIMESTAMP '2024-12-31 23:59:59', 'store', 'NL'),
  (2, NULL, 99, TIMESTAMP '2025-01-01 00:00:01', 'web', 'BE'),
  (3, 1002, 24, TIMESTAMP '2025-01-04 11:15:00', 'store', 'LU'),
  (4, 1003, 15, TIMESTAMP '2025-01-10 15:30:00', 'store', 'BE'),
  (5, 1004, 6, TIMESTAMP '2025-01-31 20:45:00', 'store', 'NL'),
  (6, NULL, 99, TIMESTAMP '2025-02-01 08:05:00', 'web', 'LU'),
  (7, 1005, 1, TIMESTAMP '2025-02-10 13:00:00', 'store', 'NL'),
  (8, 1006, 15, TIMESTAMP '2025-02-28 19:10:00', 'store', 'BE'),
  (9, 1007, 99, TIMESTAMP '2025-03-02 22:40:00', 'web', 'NL'),
  (10, 1001, 1, TIMESTAMP '2025-03-03 10:20:00', 'store', 'NL'),
  (11, NULL, 6, TIMESTAMP '2025-02-14 16:00:00', 'store', 'NL');
CREATE TABLE voltmarkt_edge_agg.order_lines AS SELECT * FROM voltmarkt.order_lines LIMIT 0;
INSERT INTO voltmarkt_edge_agg.order_lines VALUES
  (1, 1, 5, 1, 499.00, NULL, 0.00),
  (2, 4, 5, 1, 499.00, NULL, 0.00),
  (3, 1, 1, 1, 299.00, NULL, 0.00),
  (4, 7, 1, 1, 299.00, 2, 44.85),
  (5, 2, 2, 1, 129.00, NULL, 0.00),
  (6, 10, 2, 1, 129.00, NULL, 0.00),
  (7, 3, 3, 1, 86.00, NULL, 0.00),
  (8, 8, 3, 2, 86.00, NULL, 0.00),
  (9, 5, 4, 1, 49.00, NULL, 0.00),
  (10, 9, 4, NULL, 49.00, NULL, 0.00),
  (11, 4, 6, 4, 12.99, 1, 25.98),
  (12, 9, 6, 2, 12.99, NULL, 0.00),
  (13, 6, 7, 3, 14.99, NULL, 0.00),
  (14, 11, 7, 2, NULL, NULL, 0.00),
  (15, 10, 7, 2, 14.99, NULL, 0.00);

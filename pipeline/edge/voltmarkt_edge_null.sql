-- pipeline/edge/voltmarkt_edge_null.sql (family: SQL-NULL-01, ERR-SEM-04, ERR-LOG-03, ERR-LOG-17)
CREATE SCHEMA voltmarkt_edge_null;
-- Calendar days copied from the visible calendar. Event days (Sinterklaas, Black Friday, Cyber
-- Monday) sit next to days with no event (NULL) in November and December 2025, so a <> or NOT IN
-- test on event drops the ordinary days, and a date range without brackets lets the event days of
-- the other month in. 10 March 2025 is a plain day that the promotions below overlap.
CREATE TABLE voltmarkt_edge_null.calendar AS SELECT * FROM voltmarkt.calendar WHERE cal_date IN (
  DATE '2025-03-10', DATE '2025-11-10', DATE '2025-11-28', DATE '2025-11-29',
  DATE '2025-12-01', DATE '2025-12-03', DATE '2025-12-06', DATE '2025-12-09');
CREATE TABLE voltmarkt_edge_null.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_null.stores VALUES
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL),
  (2, 'BE-01', NULL, 'BE', 'standard', 'Europe/Brussels', DATE '2014-09-01', NULL),
  (3, 'LU-01', 'Luxembourg', NULL, 'standard', 'Europe/Luxembourg', NULL, DATE '2025-06-30'),
  (4, 'NL-02', 'Rotterdam', 'NL', NULL, 'Europe/Amsterdam', DATE '2013-05-15', DATE '2025-01-31');
CREATE TABLE voltmarkt_edge_null.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_null.categories VALUES (1, 'Earbuds', 'Audio'), (2, 'Cables', NULL), (3, 'Mystery', NULL);
-- Added to reach four rows: a second 'Audio' child, so COUNT(*), COUNT(parent_category) and
-- COUNT(DISTINCT parent_category) give three different numbers (4, 2, 1).
INSERT INTO voltmarkt_edge_null.categories VALUES (4, 'Headphones', 'Audio');
CREATE TABLE voltmarkt_edge_null.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_null.products VALUES
  (10, 'VM-000010', 'Sonora Air 120', 'Sonora', 1, 'Earbuds', NULL, 39.90, DATE '2023-02-01'),
  (11, 'VM-000011', 'Cablemate One 200', NULL, 2, 'Cables', NULL, NULL, DATE '2022-06-01'),
  (12, 'VM-000012', 'Unknown Lite 300', 'Energo', NULL, NULL, NULL, 4.50, NULL);
-- Added: a sister pair, so sister_product_id holds values as well as NULLs, and a cost of exactly
-- 0.00 next to product 11's unknown cost (unknown is not zero).
INSERT INTO voltmarkt_edge_null.products VALUES
  (13, 'VM-000013', 'Sonora Pro 121', 'Sonora', 1, 'Earbuds', 14, 0.00, DATE '2024-05-06'),
  (14, 'VM-000014', 'Sonora Pro 122', 'Sonora', 1, 'Earbuds', 13, 54.00, DATE '2024-05-06');
CREATE TABLE voltmarkt_edge_null.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_null.promotions VALUES
  (1, 'P-2025-01', 'January Clearance', 'clearance', DATE '2025-01-06', DATE '2025-01-19', NULL),
  (2, 'P-2025-02', NULL, 'percent_off', DATE '2025-02-03', NULL, 20.00);
-- Added: a complete promotion that overlaps the calendar's March day, and one with no promotion
-- type, which a <> filter on promo_type drops.
INSERT INTO voltmarkt_edge_null.promotions VALUES
  (3, 'P-2025-03', 'Spring Audio Deals', 'percent_off', DATE '2025-03-10', DATE '2025-03-23', 25.00),
  (4, 'P-2025-04', 'April Loyalty', NULL, DATE '2025-04-07', DATE '2025-04-20', 10.00);

-- pipeline/edge/voltmarkt_edge_filter.sql (family: SQL-FILTER-01, SQL-FILTER-02, ERR-LOG-13, ERR-LOG-15, ERR-LOG-06)
-- Values exactly on and just outside common thresholds (BETWEEN's edges, >= against >), dates on
-- the first and last day of a month, names in upper, lower and mixed case (LIKE against ILIKE),
-- and a country code outside NL, BE and LU. No NULLs beyond the visible data's own (open stores
-- have no close date, unpaired products no sister): NULL filters belong to voltmarkt_edge_null.
CREATE SCHEMA voltmarkt_edge_filter;
-- Five days around the end of February 2025, including the weekend of 1-2 March.
CREATE TABLE voltmarkt_edge_filter.calendar AS SELECT * FROM voltmarkt.calendar WHERE cal_date BETWEEN DATE '2025-02-27' AND DATE '2025-03-03';
CREATE TABLE voltmarkt_edge_filter.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_filter.stores VALUES
  (6, 'NL-06', 'Zwolle', 'NL', 'standard', 'Europe/Amsterdam', DATE '2016-10-01', DATE '2025-06-30'),
  (10, 'NL-10', 'Breda', 'NL', 'outlet', 'Europe/Amsterdam', DATE '2019-03-01', NULL),
  (15, 'BE-01', 'Brussel', 'BE', 'flagship', 'Europe/Brussels', DATE '2014-09-01', NULL),
  (16, 'BE-03', 'Leuven', 'BE', 'standard', 'Europe/Brussels', DATE '2016-05-01', NULL),
  (24, 'LU-01', 'Luxembourg', 'LU', 'flagship', 'Europe/Luxembourg', DATE '2017-11-01', NULL),
  (25, 'LU-02', 'Esch-sur-Alzette', 'LU', 'standard', 'Europe/Luxembourg', DATE '2022-05-01', NULL),
  (27, 'DE-01', 'Aachen', 'DE', 'standard', 'Europe/Berlin', DATE '2025-01-01', NULL);
CREATE TABLE voltmarkt_edge_filter.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_filter.categories VALUES
  (15, 'Headphones', 'Audio'),
  (16, 'Earbuds', 'Audio'),
  (18, 'Speakers', 'Audio'),
  (24, 'Gaming Headsets', 'Gaming'),
  (26, 'Smart Speakers', 'Smart Home'),
  (41, 'outdoor speakers', 'Audio');
CREATE TABLE voltmarkt_edge_filter.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_filter.products VALUES
  (30, 'VM-000030', 'Sonora Pro 310', 'Sonora', 16, 'Earbuds', NULL, 100.00, DATE '2024-03-01'),
  (31, 'VM-000031', 'SONORA PRO 311', 'Sonora', 16, 'Earbuds', NULL, 99.99, DATE '2024-02-29'),
  (32, 'VM-000032', 'basswell pro 412', 'Basswell', 15, 'Headphones', NULL, 100.01, DATE '2024-03-31'),
  (33, 'VM-000033', 'Echoline Air 520', 'Echoline', 18, 'Speakers', NULL, 250.00, DATE '2024-04-01'),
  (34, 'VM-000034', 'Joyforge Pro 230', 'Joyforge', 24, 'Gaming Headsets', NULL, 59.50, DATE '2024-12-31'),
  (35, 'VM-000035', 'Hivo Lite 140', 'Hivo', 26, 'Smart Speakers', NULL, 49.00, DATE '2025-01-01'),
  (36, 'VM-000036', 'Echoline Max 830', 'Echoline', 41, 'outdoor speakers', NULL, 180.00, DATE '2025-05-12');
CREATE TABLE voltmarkt_edge_filter.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_filter.promotions VALUES
  (1, 'P-2025-05', 'February Percent Off', 'percent_off', DATE '2025-02-17', DATE '2025-02-28', 9.50),
  (2, 'P-2025-06', 'March Clearance', 'clearance', DATE '2025-03-01', DATE '2025-03-14', 10.00),
  (3, 'P-2025-07', 'SPRING SOUND WEEK', 'percent_off', DATE '2025-03-17', DATE '2025-03-23', 20.00),
  (4, 'P-2025-08', 'spring audio week', 'percent_off', DATE '2025-03-24', DATE '2025-03-31', 20.50),
  (5, 'P-2025-09', 'Spring Week Bundle', 'bundle', DATE '2025-03-31', DATE '2025-04-13', 15.00),
  (6, 'P-2025-10', 'April Loyalty', 'loyalty', DATE '2025-04-01', DATE '2025-04-14', 10.00);

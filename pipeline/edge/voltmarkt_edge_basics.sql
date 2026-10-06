-- pipeline/edge/voltmarkt_edge_basics.sql (family: SQL-BASICS-01, SQL-BASICS-02, ERR-LOG-05, ERR-LOG-21)
-- Text that must come back exactly as stored (accents, an apostrophe, commas, long and lower-case
-- values), a cost of exactly 0.01 for calculated columns and rounding, and a discount that is not a
-- whole number, which the visible promotions never have.
CREATE SCHEMA voltmarkt_edge_basics;
-- Five days across New Year: 2024-12-30 starts ISO week 1 of ISO year 2025.
CREATE TABLE voltmarkt_edge_basics.calendar AS SELECT * FROM voltmarkt.calendar WHERE cal_date BETWEEN DATE '2024-12-29' AND DATE '2025-01-02';
CREATE TABLE voltmarkt_edge_basics.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_basics.stores VALUES
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL),
  (17, 'BE-05', 'Liège', 'BE', 'standard', 'Europe/Brussels', DATE '2017-03-01', NULL),
  (27, 'nl-15', '''s-Hertogenbosch', 'NL', 'standard', 'Europe/Amsterdam', DATE '2025-05-01', NULL),
  (28, 'BE-18', 'Ottignies-Louvain-la-Neuve', 'BE', 'standard', 'Europe/Brussels', DATE '2024-10-01', NULL),
  (29, 'LU-03', 'Pétange', 'LU', 'standard', 'Europe/Luxembourg', DATE '2023-09-01', NULL),
  (99, 'WEB-01', 'Online', 'NL', 'web', 'UTC', DATE '2015-01-01', NULL);
CREATE TABLE voltmarkt_edge_basics.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_basics.categories VALUES
  (1, 'TVs up to 43 inch', 'TV & Video'),
  (16, 'Earbuds', 'Audio'),
  (35, 'Cables', 'Accessories'),
  (41, 'Électroménager', 'Smart Home'),
  (42, 'Chargers, Cables and Adapters for Laptops, Tablets and Phones', 'Accessories');
CREATE TABLE voltmarkt_edge_basics.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_basics.products VALUES
  (10, 'VM-000010', 'Sonora Air 120', 'Sonora', 16, 'Earbuds', NULL, 39.90, DATE '2023-02-01'),
  (11, 'VM-000011', 'Cablemate One 200', 'Cablemate', 35, 'Cables', NULL, 0.01, DATE '2022-06-01'),
  (12, 'VM-000012', 'Hivo Café Neo 410', 'Hivo', 41, 'Électroménager', NULL, 64.90, DATE '2024-04-15'),
  (13, 'VM-000013', 'Vistara Ultra 432 Smart TV 43 inch with Wall Bracket, Remote and Two-Year Warranty', 'Vistara', 1, 'TVs up to 43 inch', NULL, 189.40, DATE '2024-08-19'),
  (14, 'VM-000014', 'Energo Max 615', 'Energo', 42, 'Chargers, Cables and Adapters for Laptops, Tablets and Phones', NULL, 24.60, DATE '2025-01-13');
CREATE TABLE voltmarkt_edge_basics.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_basics.promotions VALUES
  (1, 'P-2025-01', 'January Clearance', 'clearance', DATE '2025-01-06', DATE '2025-01-19', 50.00),
  (2, 'P-2025-09', 'Fête des Mères', 'percent_off', DATE '2025-05-05', DATE '2025-05-11', 12.50),
  (3, 'P-2025-14', 'Flash Friday', 'percent_off', DATE '2025-06-20', DATE '2025-06-20', 5.00),
  (4, 'P-2025-29', 'Black Week', 'percent_off', DATE '2025-11-24', DATE '2025-11-30', 25.00),
  (5, 'P-2025-30', 'Sinterklaas and Christmas Gift Bundles for the Whole Family', 'bundle', DATE '2025-12-01', DATE '2025-12-14', 15.00);

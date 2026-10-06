-- pipeline/edge/voltmarkt_edge_sort.sql (family: SQL-SORT-01, ERR-LOG-18, ERR-LOG-16, ERR-LOG-08, ERR-LOG-09)
-- Every table's rows are stored out of key order, so a missing ORDER BY shows. Ties sit at a top-3
-- cutoff, NULLs sit in sort columns, and equal names carry different IDs (DISTINCT can collapse
-- them, and a list of cities repeats one).
CREATE SCHEMA voltmarkt_edge_sort;
-- Six days from late 2025, inserted one at a time out of date order; some have no event.
CREATE TABLE voltmarkt_edge_sort.calendar AS SELECT * FROM voltmarkt.calendar LIMIT 0;
INSERT INTO voltmarkt_edge_sort.calendar SELECT * FROM voltmarkt.calendar WHERE cal_date = DATE '2025-11-28';
INSERT INTO voltmarkt_edge_sort.calendar SELECT * FROM voltmarkt.calendar WHERE cal_date = DATE '2025-11-19';
INSERT INTO voltmarkt_edge_sort.calendar SELECT * FROM voltmarkt.calendar WHERE cal_date = DATE '2025-12-01';
INSERT INTO voltmarkt_edge_sort.calendar SELECT * FROM voltmarkt.calendar WHERE cal_date = DATE '2025-11-22';
INSERT INTO voltmarkt_edge_sort.calendar SELECT * FROM voltmarkt.calendar WHERE cal_date = DATE '2025-12-06';
INSERT INTO voltmarkt_edge_sort.calendar SELECT * FROM voltmarkt.calendar WHERE cal_date = DATE '2025-12-05';
-- Two stores in Antwerpen; only Zwolle has a close date.
CREATE TABLE voltmarkt_edge_sort.stores AS SELECT * FROM voltmarkt.stores LIMIT 0;
INSERT INTO voltmarkt_edge_sort.stores VALUES
  (14, 'NL-14', 'Maastricht', 'NL', 'standard', 'Europe/Amsterdam', DATE '2021-04-01', NULL),
  (27, 'BE-17', 'Antwerpen', 'BE', 'outlet', 'Europe/Brussels', DATE '2025-09-01', NULL),
  (3, 'NL-03', 'Den Haag', 'NL', 'standard', 'Europe/Amsterdam', DATE '2014-02-01', NULL),
  (24, 'LU-01', 'Luxembourg', 'LU', 'flagship', 'Europe/Luxembourg', DATE '2017-11-01', NULL),
  (22, 'BE-14', 'Antwerpen', 'BE', 'standard', 'Europe/Brussels', DATE '2013-11-01', NULL),
  (6, 'NL-06', 'Zwolle', 'NL', 'standard', 'Europe/Amsterdam', DATE '2016-10-01', DATE '2025-06-30'),
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL);
-- Two categories named Cables, under different parents.
CREATE TABLE voltmarkt_edge_sort.categories AS SELECT * FROM voltmarkt.categories LIMIT 0;
INSERT INTO voltmarkt_edge_sort.categories VALUES
  (35, 'Cables', 'Accessories'),
  (3, 'TVs 65 inch and up', 'TV & Video'),
  (41, 'Cables', 'TV & Video'),
  (16, 'Earbuds', 'Audio'),
  (15, 'Headphones', 'Audio');
-- 21, 22 and 24 tie at 640.00, third-highest unit cost. 21 is first by ID and 22 first by name.
-- They are stored as 22, 24, 21: on DuckDB 1.5.6 a top 3 with no tie-break returns 24, the
-- second-stored tied row, so it matches neither tie-break. 25 and 28 share a name and a cost.
-- 26 has no cost. 27 has no brand: a product with a missing brand is still included.
CREATE TABLE voltmarkt_edge_sort.products AS SELECT * FROM voltmarkt.products LIMIT 0;
INSERT INTO voltmarkt_edge_sort.products VALUES
  (22, 'VM-000022', 'Lumio Pro 645', 'Lumio', 3, 'TVs 65 inch and up', NULL, 640.00, DATE '2024-06-10'),
  (25, 'VM-000025', 'Sonora Air 120', 'Sonora', 16, 'Earbuds', NULL, 39.90, DATE '2023-02-01'),
  (27, 'VM-000027', 'Lumio Ultra 980', NULL, 3, 'TVs 65 inch and up', NULL, 1499.00, DATE '2025-03-03'),
  (24, 'VM-000024', 'Nordvue Pro 651', 'Nordvue', 3, 'TVs 65 inch and up', NULL, 640.00, DATE '2024-02-12'),
  (26, 'VM-000026', 'Basswell Go 330', 'Basswell', 16, 'Earbuds', NULL, NULL, DATE '2025-05-05'),
  (23, 'VM-000023', 'Vistara Neo 870', 'Vistara', 3, 'TVs 65 inch and up', NULL, 899.00, DATE '2024-09-09'),
  (21, 'VM-000021', 'Vistara Max 655', 'Vistara', 3, 'TVs 65 inch and up', NULL, 640.00, DATE '2023-10-02'),
  (28, 'VM-000028', 'Sonora Air 120', 'Sonora', 16, 'Earbuds', NULL, 39.90, DATE '2025-02-03');
-- 2, 3 and 5 tie at 25.00, third-highest discount, stored as 5, 3, 2: a top 3 with no tie-break
-- returns 3, which matches no tie-break on ID, code, name or start date. Two are named Black Week.
CREATE TABLE voltmarkt_edge_sort.promotions AS SELECT * FROM voltmarkt.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_sort.promotions VALUES
  (5, 'P-2025-29', 'Black Week', 'percent_off', DATE '2025-11-24', DATE '2025-11-30', 25.00),
  (1, 'P-2024-05', 'March Clearance', 'clearance', DATE '2024-03-04', DATE '2024-03-17', 40.00),
  (3, 'P-2025-03', 'Spring Audio Deals', 'percent_off', DATE '2025-03-10', DATE '2025-03-23', 25.00),
  (6, 'P-2025-31', 'December Loyalty', 'loyalty', DATE '2025-12-08', DATE '2025-12-21', 10.00),
  (2, 'P-2024-29', 'Black Week', 'percent_off', DATE '2024-11-25', DATE '2024-12-01', 25.00),
  (4, 'P-2025-18', 'June Clearance', 'clearance', DATE '2025-06-02', DATE '2025-06-15', 50.00);

-- pipeline/edge/voltmarkt_edge_clean.sql (family: SQL-STR-01, SQL-CLEAN-01; ERR-LOG-32, ERR-LOG-33, ERR-LOG-35, ERR-LOG-36,
-- ERR-LOG-05)
-- Sprint 6 (S6-04): mirrors voltmarkt_raw, with every one of its table names and no view: the raw quirks in small form,
-- for level 4's raw items and the incident tickets (S6-01). Store orders hold the store's local time, web orders UTC
-- (Q-01-05). Planted:
--   an exact duplicate: line 15 resends BE-14's line 6 under a new ID (Q-01-01); a near duplicate: lines 8 and 9 are the
--   same product in the same BE-14 order at the same price, with quantities 1 and 2, so they are two real lines;
--   BE-07 lines in cents in June 2024 (Q-01-02), one BE-07 line in cents on 29 May 2024, outside June, and a BE-07 line in
--   euros in July;
--   every category spelling of the TV parent: "TV & Video", "tv en video", "TV/Video " (a trailing space) and
--   "Téléviseurs", beside child names; one of them on a product with no category_id (Q-01-04);
--   skus in lower case, with trailing spaces, and one with an inner space ("VM-000 005") that TRIM does not fix (Q-01-07);
--   price windows: two that touch but do not overlap (product 1: to 31 May, from 1 June), two that overlap for 5 days
--   (product 5, Q-01-06) and two that overlap on one day (product 8: both valid on 20 June), with a sale on that day;
--   a store order at 23:30 local time on 30 June 2024, still June in Amsterdam, beside a web order at 23:30 UTC that day,
--   which is 1 July in Amsterdam;
--   guest orders (customer_id missing), a business state, not a quirk (E-155).
-- Line prices are the list price on the order's local date, but for the cents; discounts stay in euros (Q-01-02).
CREATE SCHEMA voltmarkt_edge_clean;
CREATE TABLE voltmarkt_edge_clean.calendar AS SELECT * FROM voltmarkt_raw.calendar WHERE cal_date IN (
  DATE '2024-05-29', DATE '2024-05-31', DATE '2024-06-01', DATE '2024-06-03', DATE '2024-06-10', DATE '2024-06-12',
  DATE '2024-06-14', DATE '2024-06-15', DATE '2024-06-20', DATE '2024-06-28', DATE '2024-06-30', DATE '2024-07-01',
  DATE '2024-07-02');
CREATE TABLE voltmarkt_edge_clean.stores AS SELECT * FROM voltmarkt_raw.stores LIMIT 0;
INSERT INTO voltmarkt_edge_clean.stores VALUES
  (1, 'NL-01', 'Amsterdam', 'NL', 'flagship', 'Europe/Amsterdam', DATE '2012-03-01', NULL),
  (18, 'BE-07', 'Gent', 'BE', 'standard', 'Europe/Brussels', DATE '2015-10-01', NULL),
  (22, 'BE-14', 'Antwerpen', 'BE', 'standard', 'Europe/Brussels', DATE '2013-11-01', NULL),
  (99, 'WEB-01', 'Online', 'NL', 'web', 'UTC', DATE '2015-01-01', NULL);
CREATE TABLE voltmarkt_edge_clean.categories AS SELECT * FROM voltmarkt_raw.categories LIMIT 0;
INSERT INTO voltmarkt_edge_clean.categories VALUES
  (1, 'TVs up to 43 inch', 'TV & Video'),
  (2, 'TVs 50-55 inch', 'TV & Video'),
  (16, 'Earbuds', 'Audio'),
  (35, 'Cables', 'Accessories');
CREATE TABLE voltmarkt_edge_clean.products AS SELECT * FROM voltmarkt_raw.products LIMIT 0;
INSERT INTO voltmarkt_edge_clean.products VALUES
  (1, 'VM-000001', 'Vistara Pro 550', 'Vistara', 2, 'TV & Video', NULL, 640.00, DATE '2023-04-03'),
  (2, 'vm-000002  ', 'Lumio Max 552', 'Lumio', 2, 'tv en video', NULL, 610.00, DATE '2023-08-14'),
  (3, 'VM-000003', 'Nordvue One 500', 'Nordvue', NULL, 'TV/Video ', NULL, 420.00, DATE '2022-02-01'),
  (4, 'VM-000004', 'Vistara Neo 551', 'Vistara', 2, 'Téléviseurs', NULL, 560.00, DATE '2024-03-04'),
  (5, 'VM-000 005', 'Sonora Pro 311', 'Sonora', 16, 'Earbuds', 6, 99.00, DATE '2023-09-18'),
  (6, 'vm-000006', 'Sonora Lite 312', 'Sonora', 16, 'Earbuds', 5, 39.00, DATE '2022-03-14'),
  (7, 'VM-000007', 'Lumio Go 430', 'Lumio', 1, 'TVs up to 43 inch', NULL, 220.00, DATE '2023-01-09'),
  (8, 'VM-000008', 'Cablemate One 200', 'Cablemate', 35, 'Cables', NULL, 5.00, DATE '2022-06-01');
CREATE TABLE voltmarkt_edge_clean.promotions AS SELECT * FROM voltmarkt_raw.promotions LIMIT 0;
INSERT INTO voltmarkt_edge_clean.promotions VALUES
  (1, 'P-2024-15', 'June Earbuds Days', 'percent_off', DATE '2024-06-03', DATE '2024-06-16', 20.00),
  (2, 'P-2024-16', 'Summer TV Days', 'percent_off', DATE '2024-07-08', DATE '2024-07-21', 15.00);
CREATE TABLE voltmarkt_edge_clean.promotion_products AS SELECT * FROM voltmarkt_raw.promotion_products LIMIT 0;
INSERT INTO voltmarkt_edge_clean.promotion_products VALUES (1, 6), (2, 1), (2, 4);
CREATE TABLE voltmarkt_edge_clean.price_history AS SELECT * FROM voltmarkt_raw.price_history LIMIT 0;
INSERT INTO voltmarkt_edge_clean.price_history VALUES
  (1, DATE '2023-04-03', DATE '2024-05-31', 899.00),
  (1, DATE '2024-06-01', NULL, 849.00),
  (2, DATE '2023-08-14', NULL, 869.00),
  (3, DATE '2022-02-01', NULL, 599.00),
  (4, DATE '2024-03-04', NULL, 799.00),
  (5, DATE '2023-09-18', DATE '2024-06-14', 179.00),
  (5, DATE '2024-06-10', NULL, 169.00),
  (6, DATE '2022-03-14', NULL, 69.00),
  (7, DATE '2023-01-09', NULL, 349.00),
  (8, DATE '2022-06-01', DATE '2024-06-20', 12.99),
  (8, DATE '2024-06-20', NULL, 11.99);
CREATE TABLE voltmarkt_edge_clean.orders AS SELECT * FROM voltmarkt_raw.orders LIMIT 0;
INSERT INTO voltmarkt_edge_clean.orders VALUES
  (1, 4001, 18, TIMESTAMP '2024-06-03 11:20:00', 'store', 'BE'),
  (2, NULL, 18, TIMESTAMP '2024-06-28 17:45:00', 'store', 'BE'),
  (3, 4002, 18, TIMESTAMP '2024-05-29 15:10:00', 'store', 'BE'),
  (4, 4001, 18, TIMESTAMP '2024-07-02 10:05:00', 'store', 'BE'),
  (5, 4003, 22, TIMESTAMP '2024-06-12 12:30:00', 'store', 'BE'),
  (6, 4004, 22, TIMESTAMP '2024-06-12 16:40:00', 'store', 'BE'),
  (7, 4005, 1, TIMESTAMP '2024-06-30 23:30:00', 'store', 'NL'),
  (8, 4006, 99, TIMESTAMP '2024-06-30 23:30:00', 'web', 'NL'),
  (9, NULL, 99, TIMESTAMP '2024-06-15 08:00:00', 'web', 'LU'),
  (10, 4002, 22, TIMESTAMP '2024-06-20 14:15:00', 'store', 'BE');
CREATE TABLE voltmarkt_edge_clean.order_lines AS SELECT * FROM voltmarkt_raw.order_lines LIMIT 0;
INSERT INTO voltmarkt_edge_clean.order_lines VALUES
  (1, 1, 6, 1, 6900.00, 1, 13.80),
  (2, 1, 8, 2, 1299.00, NULL, 0.00),
  (3, 2, 1, 1, 84900.00, NULL, 0.00),
  (4, 3, 7, 1, 34900.00, NULL, 0.00),
  (5, 4, 7, 1, 349.00, NULL, 0.00),
  (6, 5, 5, 1, 169.00, NULL, 0.00),
  (7, 5, 2, 1, 869.00, NULL, 0.00),
  (8, 6, 8, 1, 12.99, NULL, 0.00),
  (9, 6, 8, 2, 12.99, NULL, 0.00),
  (10, 7, 4, 1, 799.00, NULL, 0.00),
  (11, 8, 3, 1, 599.00, NULL, 0.00),
  (12, 9, 6, 2, 69.00, 1, 27.60),
  (13, 9, 8, 1, 12.99, NULL, 0.00),
  (14, 10, 8, 1, 11.99, NULL, 0.00),
  (15, 5, 5, 1, 169.00, NULL, 0.00);
-- M5 (D90, S6-36): added after the sprint 6 build, so every row above stays as it was. The calendar gains voltmarkt_raw's row
-- for each day of each promotion above that it lacked, so promotion days counted through the calendar match date arithmetic.
INSERT INTO voltmarkt_edge_clean.calendar SELECT c.* FROM voltmarkt_raw.calendar AS c
WHERE EXISTS (SELECT 1 FROM voltmarkt_edge_clean.promotions AS p WHERE c.cal_date BETWEEN p.start_date AND p.end_date)
  AND NOT EXISTS (SELECT 1 FROM voltmarkt_edge_clean.calendar AS e WHERE e.cal_date = c.cal_date)
ORDER BY c.cal_date;

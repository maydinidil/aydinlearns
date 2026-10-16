-- pipeline/edge/breakfast_at_the_frat_edge.sql (sprint 6 Part 2, S6-23; Task G2)
-- The hidden edge data for items on Breakfast at the Frat (DS-PRICE-101, schema breakfast_at_the_frat): our own invented rows,
-- never the dataset's, under the prepared tables' names and with their columns and types (pipeline/datasets/
-- breakfast_at_the_frat.py). It holds no view and reads no other schema, so it is built whether or not the real data is
-- prepared. Weeks end on a Wednesday, as the dataset's do. Planted:
--   a week with no sales: no row at all in the week ending 28 January 2009, between weeks that have sales;
--   a store missing from the lookup: store_num 299 sells in the week ending 21 January 2009, and stores has no store_id 299;
--   a TPR row that is also featured: tpr_only 1 and feature 1 (store 101, product 9000000001, week ending 21 January 2009),
--   beside plain rows of each promotion kind (featured, on display, a price reduction only) and rows with no promotion;
--   a store with a missing parking space count.
CREATE SCHEMA breakfast_at_the_frat_edge;
CREATE TABLE breakfast_at_the_frat_edge.transactions (
  week_end_date DATE,
  store_num INTEGER,
  upc VARCHAR,
  units INTEGER,
  visits INTEGER,
  hhs INTEGER,
  spend DOUBLE,
  price DOUBLE,
  base_price DOUBLE,
  feature INTEGER,
  display INTEGER,
  tpr_only INTEGER
);
CREATE TABLE breakfast_at_the_frat_edge.products (
  upc VARCHAR,
  description VARCHAR,
  manufacturer VARCHAR,
  category VARCHAR,
  sub_category VARCHAR,
  product_size VARCHAR
);
CREATE TABLE breakfast_at_the_frat_edge.stores (
  store_id INTEGER,
  store_name VARCHAR,
  address_city_name VARCHAR,
  address_state_prov_code VARCHAR,
  msa_code VARCHAR,
  seg_value_name VARCHAR,
  parking_space_qty INTEGER,
  sales_area_size_num INTEGER,
  avg_weekly_baskets DOUBLE
);
INSERT INTO breakfast_at_the_frat_edge.transactions VALUES
  (DATE '2009-01-14', 101, '9000000001', 12, 11, 10, 16.68, 1.39, 1.39, 0, 0, 0),
  (DATE '2009-01-14', 101, '9000000002', 8, 8, 8, 23.92, 2.99, 3.49, 0, 0, 1),
  (DATE '2009-01-14', 102, '9000000001', 20, 18, 17, 25.00, 1.25, 1.39, 1, 0, 0),
  (DATE '2009-01-14', 102, '9000000003', 5, 5, 5, 17.45, 3.49, 3.49, 0, 1, 0),
  (DATE '2009-01-21', 101, '9000000001', 15, 14, 13, 18.75, 1.25, 1.39, 1, 0, 1),
  (DATE '2009-01-21', 102, '9000000002', 6, 6, 6, 20.94, 3.49, 3.49, 0, 0, 0),
  (DATE '2009-01-21', 299, '9000000004', 9, 9, 8, 44.91, 4.99, 5.99, 0, 0, 1),
  (DATE '2009-02-04', 101, '9000000001', 11, 10, 10, 15.29, 1.39, 1.39, 0, 0, 0),
  (DATE '2009-02-04', 102, '9000000003', 4, 4, 4, 13.96, 3.49, 3.49, 0, 0, 0),
  (DATE '2009-02-04', 103, '9000000004', 7, 7, 7, 41.93, 5.99, 5.99, 0, 0, 0);
INSERT INTO breakfast_at_the_frat_edge.products VALUES
  ('9000000001', 'EDGE PRETZEL TWISTS', 'MAKER ONE', 'BAG SNACKS', 'PRETZELS', '15 OZ'),
  ('9000000002', 'EDGE CORN FLAKES', 'MAKER TWO', 'COLD CEREAL', 'ALL FAMILY CEREAL', '12 OZ'),
  ('9000000003', 'EDGE MINT RINSE', 'MAKER ONE', 'ORAL HYGIENE PRODUCTS', 'MOUTHWASHES', '500 ML'),
  ('9000000004', 'EDGE STONE OVEN PIZZA', 'MAKER THREE', 'FROZEN PIZZA', 'PIZZA/PREMIUM', '29.6 OZ');
INSERT INTO breakfast_at_the_frat_edge.stores VALUES
  (101, 'STORE ONE', 'MIDDLETOWN', 'OH', '99001', 'VALUE', 196, 24721, 12707.0),
  (102, 'STORE TWO', 'HILLSIDE', 'KY', '99001', 'UPSCALE', NULL, 46073, 24766.5),
  (103, 'STORE THREE', 'LAKEVIEW', 'TX', '99002', 'MAINSTREAM', 350, 31000, 18500.0);

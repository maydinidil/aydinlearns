-- pipeline/edge/online_retail_ii_edge.sql (sprint 6 Part 2, S6-23; Task G2)
-- The hidden edge data for items on Online Retail II (DS-RETAIL-02, schema online_retail_ii): our own invented rows, never the
-- dataset's, under the prepared table's name and with its columns and types (pipeline/datasets/online_retail_ii.py). It holds no
-- view and reads no other schema, so it is built whether or not the real data is prepared. Planted:
--   a cancelled invoice: C900004 cancels two lines of invoice 900001, with negative quantities;
--   lines with a missing customer ID: invoice 900003, and the stock adjustment below;
--   a negative quantity on an invoice that is not cancelled: 900006, a stock adjustment at price 0;
--   a postage line: stock code POST on invoice 900002, beside its product line;
--   a repeated line: invoice 900005's second line repeats its first in every column;
--   stock codes that look like numbers (90001) beside codes that end in a letter (90001B).
CREATE SCHEMA online_retail_ii_edge;
CREATE TABLE online_retail_ii_edge.invoice_lines (
  invoice VARCHAR,
  stock_code VARCHAR,
  description VARCHAR,
  quantity INTEGER,
  invoice_date TIMESTAMP,
  price DOUBLE,
  customer_id INTEGER,
  country VARCHAR
);
INSERT INTO online_retail_ii_edge.invoice_lines VALUES
  ('900001', '90001', 'BLUE ENAMEL MUG', 6, TIMESTAMP '2010-12-06 09:15:00', 2.10, 17001, 'United Kingdom'),
  ('900001', '90001B', 'BLUE ENAMEL MUG SET', 2, TIMESTAMP '2010-12-06 09:15:00', 7.50, 17001, 'United Kingdom'),
  ('900001', '90002', 'TIN LANTERN', 4, TIMESTAMP '2010-12-06 09:15:00', 3.25, 17001, 'United Kingdom'),
  ('900002', '90003', 'PAPER STAR GARLAND', 12, TIMESTAMP '2010-12-14 11:40:00', 0.85, 12002, 'France'),
  ('900002', 'POST', 'POSTAGE', 1, TIMESTAMP '2010-12-14 11:40:00', 18.00, 12002, 'France'),
  ('C900004', '90001', 'BLUE ENAMEL MUG', -2, TIMESTAMP '2010-12-20 15:05:00', 2.10, 17001, 'United Kingdom'),
  ('C900004', '90002', 'TIN LANTERN', -4, TIMESTAMP '2010-12-20 15:05:00', 3.25, 17001, 'United Kingdom'),
  ('900003', '90004', 'WOODEN HEART SIGN', 3, TIMESTAMP '2011-01-10 10:30:00', 1.65, NULL, 'United Kingdom'),
  ('900003', '90003', 'PAPER STAR GARLAND', 24, TIMESTAMP '2011-01-10 10:30:00', 0.72, NULL, 'United Kingdom'),
  ('900005', '90005', 'GLASS JAR WITH LID', 6, TIMESTAMP '2011-01-18 13:20:00', 1.95, 13003, 'Germany'),
  ('900005', '90005', 'GLASS JAR WITH LID', 6, TIMESTAMP '2011-01-18 13:20:00', 1.95, 13003, 'Germany'),
  ('900006', '90004', 'DAMAGED', -10, TIMESTAMP '2011-01-25 09:00:00', 0.00, NULL, 'United Kingdom'),
  ('900007', '90002', 'TIN LANTERN', 1, TIMESTAMP '2011-02-02 16:45:00', 3.25, 12002, 'France'),
  ('900008', '90001B', 'BLUE ENAMEL MUG SET', 1, TIMESTAMP '2011-02-07 12:10:00', 7.50, 13003, 'Germany');

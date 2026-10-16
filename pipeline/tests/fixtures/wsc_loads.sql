-- pipeline/tests/fixtures/wsc_loads.sql: an invented case study script in PostgreSQL's style, for the 8 Week SQL Challenge
-- loader's tests (sprint 6 Part 2, Task G2). Nothing here comes from the challenge. It's written to load: this comment's
-- apostrophe and semicolon; must not end a statement; SET search_path makes the schema the default, so the tables are named
-- without it; one string holds a ; and another a doubled quote.
CREATE SCHEMA tiny_bistro;
SET search_path = tiny_bistro;

CREATE TABLE visits (
  "guest_code" VARCHAR(1),
  "visit_date" DATE,
  "dish_id" INTEGER
);

INSERT INTO visits
  ("guest_code", "visit_date", "dish_id")
VALUES
  ('P', '2022-03-01', '1'),
  ('P', '2022-03-04', '2'),
  ('Q', '2022-03-02', '1');

/* A block comment; with a semicolon and a quote ' inside. */
CREATE TABLE dishes (
  "dish_id" INTEGER,
  "dish_name" VARCHAR(20),
  "price" INTEGER
);

INSERT INTO dishes
  ("dish_id", "dish_name", "price")
VALUES
  ('1', 'beans; on toast', '7'),
  ('2', 'chef''s stew', '12');

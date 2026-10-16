-- pipeline/tests/fixtures/wsc_edits.sql: an invented script for the loader's PostgreSQL edits (S6-39, E-198): tables named
-- with their schema, DROP TABLE IF EXISTS (skipped), FLOAT columns (created as DOUBLE) and UPDATE statements on the script's
-- own schema that turn blank or 'NULL' text into missing values. Nothing here comes from the 8 Week SQL Challenge.
CREATE SCHEMA tiny_panels;

DROP TABLE IF EXISTS tiny_panels.readings;
CREATE TABLE tiny_panels.readings (
  "month_label" VARCHAR(7),
  "panel_id" VARCHAR(5),
  "share" FLOAT,
  "score" FLOAT
);

INSERT INTO tiny_panels.readings
  ("month_label", "panel_id", "share", "score")
VALUES
  ('04-2019', '501', '0.1', '2.25'),
  ('', '502', '1.5', '3.5'),
  ('NULL', 'NULL', '0.3', '1.75');

UPDATE tiny_panels.readings SET month_label = NULL WHERE month_label = '';
UPDATE tiny_panels.readings SET month_label = NULL WHERE month_label = 'NULL';
UPDATE tiny_panels.readings SET panel_id = NULL WHERE panel_id = 'NULL';

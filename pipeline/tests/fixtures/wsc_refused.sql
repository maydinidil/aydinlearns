-- pipeline/tests/fixtures/wsc_refused.sql: an invented script whose third statement reads a file. The loader refuses the
-- whole script, naming that statement's first word, before any statement runs.
CREATE SCHEMA tiny_refused;
CREATE TABLE tiny_refused.numbers ("n" INTEGER);
COPY tiny_refused.numbers FROM 'numbers.csv';
INSERT INTO tiny_refused.numbers ("n") VALUES (1);

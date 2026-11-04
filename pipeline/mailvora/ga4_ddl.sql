-- Mailvora's GA4 export sample (sprint 9, Task L1; S9-02, ERRATA E-218). {schema} is replaced by the build script.
-- One table, events, in the shape of GA4's BigQuery export (knowledge/07 §5.2) cut to what SQL level 7 uses: one row per event,
-- event_params a list of key and value structs. BigQuery stores one table per day (events_YYYYMMDD); here the days are stacked in
-- one table. No key (the export has none), and no truth value (pipeline/mailvora/ga4.py derives it from mailvora's rows).
-- Ruling S9-C18: a graded query names no schema, so the four mailvora tables a level 7 item joins to events are here as views onto
-- mailvora's own tables (every row, the same names and columns), built after mailvora. mailvora_edge_ga4 holds tables of those names.
CREATE SCHEMA IF NOT EXISTS {schema};
CREATE TABLE {schema}.events (event_date VARCHAR, event_timestamp BIGINT, event_name VARCHAR, event_params STRUCT(key VARCHAR, value STRUCT(string_value VARCHAR, int_value BIGINT, float_value DOUBLE, double_value DOUBLE))[], user_id VARCHAR, user_pseudo_id VARCHAR, traffic_source STRUCT(name VARCHAR, medium VARCHAR, source VARCHAR), device STRUCT(category VARCHAR), geo STRUCT(country VARCHAR), ecommerce STRUCT(transaction_id VARCHAR, purchase_revenue DOUBLE));
CREATE VIEW {schema}.sessions AS SELECT * FROM mailvora.sessions;
CREATE VIEW {schema}.signups AS SELECT * FROM mailvora.signups;
CREATE VIEW {schema}.subscriptions AS SELECT * FROM mailvora.subscriptions;
CREATE VIEW {schema}.payments AS SELECT * FROM mailvora.payments;

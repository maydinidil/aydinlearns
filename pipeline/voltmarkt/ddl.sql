-- Voltmarkt clean tables (knowledge/05 CO-01 plus design §10's first-build changes).
-- {schema} is replaced by the build script. Slice 1a: the five level 1 tables. Slice 1b: the order data
-- (E-016 adds orders.ship_to_country) and the canonical beginner sales view.
CREATE SCHEMA IF NOT EXISTS {schema};
CREATE TABLE {schema}.calendar (cal_date DATE PRIMARY KEY, iso_year INTEGER, iso_week INTEGER, week_start DATE, month_start DATE, month INTEGER, quarter INTEGER, weekday_name VARCHAR, is_weekend BOOLEAN, event VARCHAR);
CREATE TABLE {schema}.stores (store_id INTEGER PRIMARY KEY, store_code VARCHAR, city VARCHAR, country_code VARCHAR, store_type VARCHAR, timezone VARCHAR, opened_on DATE, close_date DATE);
CREATE TABLE {schema}.categories (category_id INTEGER PRIMARY KEY, category_name VARCHAR, parent_category VARCHAR);
CREATE TABLE {schema}.products (product_id INTEGER PRIMARY KEY, sku VARCHAR, product_name VARCHAR, brand VARCHAR, category_id INTEGER, category_raw VARCHAR, sister_product_id INTEGER, unit_cost_eur DECIMAL(10,2), launch_date DATE);
CREATE TABLE {schema}.promotions (promo_id INTEGER PRIMARY KEY, promo_code VARCHAR, promo_name VARCHAR, promo_type VARCHAR, start_date DATE, end_date DATE, discount_pct DECIMAL(5,2));
CREATE TABLE {schema}.price_history (product_id INTEGER, valid_from DATE, valid_to DATE, list_price_eur DECIMAL(10,2), PRIMARY KEY (product_id, valid_from));
CREATE TABLE {schema}.promotion_products (promo_id INTEGER, product_id INTEGER, PRIMARY KEY (promo_id, product_id));
CREATE TABLE {schema}.orders (order_id BIGINT PRIMARY KEY, customer_id BIGINT, store_id INTEGER, order_ts TIMESTAMP, channel VARCHAR, ship_to_country VARCHAR);
CREATE TABLE {schema}.order_lines (order_line_id BIGINT PRIMARY KEY, order_id BIGINT, product_id INTEGER, quantity INTEGER, unit_price_eur DECIMAL(10,2), promo_id INTEGER, line_discount_eur DECIMAL(10,2));
-- The canonical beginner sales view (design §10, T-15): one row per order line, no order-level measure.
-- Net revenue follows E-103, country is the ship-to country (E-016), parent_category is E-147's.
-- It reads only its own schema's tables, by qualified name, and holds no data literal: the build applies
-- this statement to voltmarkt and to each level 2 edge schema. LEFT JOINs keep every order line.
CREATE VIEW {schema}.sales AS
SELECT
    ol.order_line_id,
    ol.order_id,
    CAST(o.order_ts AS DATE) AS order_date,
    CAST(date_trunc('week', o.order_ts) AS DATE) AS order_week,
    CAST(date_trunc('month', o.order_ts) AS DATE) AS order_month,
    s.store_code,
    o.ship_to_country AS country_code,
    o.channel,
    c.parent_category,
    c.category_name,
    ol.product_id,
    p.product_name,
    ol.quantity AS units,
    ol.quantity * ol.unit_price_eur - ol.line_discount_eur AS net_revenue_eur,
    p.unit_cost_eur
FROM {schema}.order_lines AS ol
LEFT JOIN {schema}.orders AS o ON o.order_id = ol.order_id
LEFT JOIN {schema}.stores AS s ON s.store_id = o.store_id
LEFT JOIN {schema}.products AS p ON p.product_id = ol.product_id
LEFT JOIN {schema}.categories AS c ON c.category_id = p.category_id;

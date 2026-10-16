-- Mailvora clean tables (knowledge/05 CO-03; sprint 6 Part 2, S6-20). {schema} is replaced by the build script.
-- 05 CO-03's nine tables in its own order, then budget_monthly (MKT-02) and countries (E-107). Spend is stored per day, in
-- euros (E-086); every *_ts, session_start, paid_at and event_ts column is a TIMESTAMPTZ, as CO-03 gives it. GEN-05: a primary
-- key wherever CO-03 gives one; activation_events has none. There is no view, and no truth value (OD-GEN-01, E-091).
CREATE SCHEMA IF NOT EXISTS {schema};
CREATE TABLE {schema}.channels (channel_id INTEGER PRIMARY KEY, channel_name VARCHAR, channel_group VARCHAR, cost_model VARCHAR);
CREATE TABLE {schema}.campaigns (campaign_id INTEGER PRIMARY KEY, channel_id INTEGER, campaign_name VARCHAR, utm_campaign VARCHAR, start_date DATE, end_date DATE);
CREATE TABLE {schema}.ad_spend_daily (spend_date DATE, campaign_id INTEGER, impressions BIGINT, clicks INTEGER, spend DECIMAL(12,2), currency VARCHAR, export_timezone VARCHAR, PRIMARY KEY (spend_date, campaign_id));
CREATE TABLE {schema}.fx_rates_monthly (month DATE, currency VARCHAR, eur_per_unit DECIMAL(12,6), PRIMARY KEY (month, currency));
CREATE TABLE {schema}.sessions (session_id BIGINT PRIMARY KEY, visitor_id VARCHAR, session_start TIMESTAMPTZ, utm_source VARCHAR, utm_medium VARCHAR, utm_campaign VARCHAR, landing_page VARCHAR, device VARCHAR, country_code VARCHAR);
CREATE TABLE {schema}.signups (user_id BIGINT PRIMARY KEY, visitor_id VARCHAR, signup_ts TIMESTAMPTZ, country_code VARCHAR, email_domain VARCHAR);
CREATE TABLE {schema}.activation_events (user_id BIGINT, event_ts TIMESTAMPTZ, event_name VARCHAR);
CREATE TABLE {schema}.subscriptions (subscription_id BIGINT PRIMARY KEY, user_id BIGINT, plan_name VARCHAR, start_date DATE, end_date DATE, monthly_price_eur DECIMAL(8,2));
CREATE TABLE {schema}.payments (payment_id BIGINT PRIMARY KEY, subscription_id BIGINT, paid_at TIMESTAMPTZ, amount_eur DECIMAL(10,2), refunded BOOLEAN);
CREATE TABLE {schema}.budget_monthly (month DATE, channel_id INTEGER, budget_eur DECIMAL(12,2), PRIMARY KEY (month, channel_id));
CREATE TABLE {schema}.countries (country_code VARCHAR PRIMARY KEY, timezone VARCHAR);
-- The raw schema, {schema}_raw (P31): the quirk tables sessions (Q-03-01, -05, -06) and ad_spend_daily (Q-03-02, -03, -04), and
-- unchanged copies of payments (Q-03-07 is a business state, P32), channels, campaigns and fx_rates_monthly, which a raw ticket
-- joins, and of signups (P37), so FIND-03-11 can be computed on the raw schema alone. GEN-05: ad_spend_daily has a key quirk
-- (the re-imported rows), so it has no key.
CREATE SCHEMA IF NOT EXISTS {schema}_raw;
CREATE TABLE {schema}_raw.channels (channel_id INTEGER PRIMARY KEY, channel_name VARCHAR, channel_group VARCHAR, cost_model VARCHAR);
CREATE TABLE {schema}_raw.campaigns (campaign_id INTEGER PRIMARY KEY, channel_id INTEGER, campaign_name VARCHAR, utm_campaign VARCHAR, start_date DATE, end_date DATE);
CREATE TABLE {schema}_raw.ad_spend_daily (spend_date DATE, campaign_id INTEGER, impressions BIGINT, clicks INTEGER, spend DECIMAL(12,2), currency VARCHAR, export_timezone VARCHAR);
CREATE TABLE {schema}_raw.fx_rates_monthly (month DATE, currency VARCHAR, eur_per_unit DECIMAL(12,6), PRIMARY KEY (month, currency));
CREATE TABLE {schema}_raw.sessions (session_id BIGINT PRIMARY KEY, visitor_id VARCHAR, session_start TIMESTAMPTZ, utm_source VARCHAR, utm_medium VARCHAR, utm_campaign VARCHAR, landing_page VARCHAR, device VARCHAR, country_code VARCHAR);
CREATE TABLE {schema}_raw.signups (user_id BIGINT PRIMARY KEY, visitor_id VARCHAR, signup_ts TIMESTAMPTZ, country_code VARCHAR, email_domain VARCHAR);
CREATE TABLE {schema}_raw.payments (payment_id BIGINT PRIMARY KEY, subscription_id BIGINT, paid_at TIMESTAMPTZ, amount_eur DECIMAL(10,2), refunded BOOLEAN);

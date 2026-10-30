-- LedgerLoop clean tables (knowledge/05 CO-02; sprint 8, S8-01). {schema} is replaced by the build script.
-- 05 CO-02's eleven tables in its own order, then S8-01's five: leads, opportunities, cogs_monthly, sm_expense_monthly (S8-05) and
-- app_events (S8-06). Every time is Brussels local TIMESTAMP, payments.attempted_at included (Q-02-04 is raw's), except
-- app_events.event_ts, a UTC TIMESTAMPTZ. GEN-05: a primary key on every table. This file makes no view (the build adds
-- mrr_monthly, E-215), and there is no truth value (OD-GEN-01, E-091).
CREATE SCHEMA IF NOT EXISTS {schema};
CREATE TABLE {schema}.accounts (account_id INTEGER PRIMARY KEY, account_name VARCHAR, country_code VARCHAR, segment VARCHAR, employee_band VARCHAR, industry VARCHAR, acquisition_channel VARCHAR, created_at TIMESTAMP, is_test BOOLEAN);
CREATE TABLE {schema}.plans (plan_id INTEGER PRIMARY KEY, plan_name VARCHAR, list_price_eur_month DECIMAL(10,2), valid_from DATE, valid_to DATE);
CREATE TABLE {schema}.subscriptions (subscription_id INTEGER PRIMARY KEY, account_id INTEGER, plan_id INTEGER, billing_period VARCHAR, currency VARCHAR, start_date DATE, end_date DATE, mrr_local DECIMAL(12,2));
CREATE TABLE {schema}.subscription_events (event_id BIGINT PRIMARY KEY, subscription_id INTEGER, account_id INTEGER, event_type VARCHAR, event_date DATE, mrr_delta_local DECIMAL(12,2), recorded_at TIMESTAMP);
CREATE TABLE {schema}.invoices (invoice_id BIGINT PRIMARY KEY, account_id INTEGER, subscription_id INTEGER, invoice_date DATE, amount_local DECIMAL(12,2), currency VARCHAR, status VARCHAR);
CREATE TABLE {schema}.payments (payment_id BIGINT PRIMARY KEY, invoice_id BIGINT, attempt_no INTEGER, attempted_at TIMESTAMP, succeeded BOOLEAN, failure_reason VARCHAR);
CREATE TABLE {schema}.fx_rates (rate_date DATE, currency VARCHAR, eur_per_unit DECIMAL(12,6), PRIMARY KEY (rate_date, currency));
CREATE TABLE {schema}.users (user_id BIGINT PRIMARY KEY, account_id INTEGER, role VARCHAR, invited_at TIMESTAMP, deactivated_at TIMESTAMP);
CREATE TABLE {schema}.usage_weekly (account_id INTEGER, week_start DATE, active_users INTEGER, reconciliations_run INTEGER, ap_module_events INTEGER, PRIMARY KEY (account_id, week_start));
CREATE TABLE {schema}.support_tickets (ticket_id BIGINT PRIMARY KEY, account_id INTEGER, opened_at TIMESTAMP, category VARCHAR, priority VARCHAR, resolved_at TIMESTAMP);
CREATE TABLE {schema}.marketing_spend_monthly (month DATE, channel VARCHAR, spend_eur DECIMAL(12,2), PRIMARY KEY (month, channel));
CREATE TABLE {schema}.leads (lead_id BIGINT PRIMARY KEY, created_at TIMESTAMP, source VARCHAR, segment VARCHAR, email VARCHAR);
CREATE TABLE {schema}.opportunities (opportunity_id BIGINT PRIMARY KEY, lead_id BIGINT, account_id INTEGER, created_at TIMESTAMP, stage VARCHAR, closed_at TIMESTAMP, is_won BOOLEAN, amount_eur DECIMAL(12,2));
CREATE TABLE {schema}.cogs_monthly (month DATE, cost_type VARCHAR, amount_eur DECIMAL(12,2), PRIMARY KEY (month, cost_type));
CREATE TABLE {schema}.sm_expense_monthly (month DATE, channel VARCHAR, cost_type VARCHAR, amount_eur DECIMAL(12,2), PRIMARY KEY (month, channel, cost_type));
CREATE TABLE {schema}.app_events (event_id BIGINT PRIMARY KEY, user_id BIGINT, account_id INTEGER, event_ts TIMESTAMPTZ, event_name VARCHAR);
-- The raw schema, {schema}_raw (S8-01): a copy of every table, with Q-02-01 to Q-02-07 on the copies of accounts, subscriptions,
-- subscription_events, invoices and payments, and the rest unchanged. GEN-05: subscription_events has a key quirk (Q-02-01's
-- duplicates), so it has no key; payments.attempted_at holds the provider's UTC instants (Q-02-04).
CREATE SCHEMA IF NOT EXISTS {schema}_raw;
CREATE TABLE {schema}_raw.accounts (account_id INTEGER PRIMARY KEY, account_name VARCHAR, country_code VARCHAR, segment VARCHAR, employee_band VARCHAR, industry VARCHAR, acquisition_channel VARCHAR, created_at TIMESTAMP, is_test BOOLEAN);
CREATE TABLE {schema}_raw.plans (plan_id INTEGER PRIMARY KEY, plan_name VARCHAR, list_price_eur_month DECIMAL(10,2), valid_from DATE, valid_to DATE);
CREATE TABLE {schema}_raw.subscriptions (subscription_id INTEGER PRIMARY KEY, account_id INTEGER, plan_id INTEGER, billing_period VARCHAR, currency VARCHAR, start_date DATE, end_date DATE, mrr_local DECIMAL(12,2));
CREATE TABLE {schema}_raw.subscription_events (event_id BIGINT, subscription_id INTEGER, account_id INTEGER, event_type VARCHAR, event_date DATE, mrr_delta_local DECIMAL(12,2), recorded_at TIMESTAMP);
CREATE TABLE {schema}_raw.invoices (invoice_id BIGINT PRIMARY KEY, account_id INTEGER, subscription_id INTEGER, invoice_date DATE, amount_local DECIMAL(12,2), currency VARCHAR, status VARCHAR);
CREATE TABLE {schema}_raw.payments (payment_id BIGINT PRIMARY KEY, invoice_id BIGINT, attempt_no INTEGER, attempted_at TIMESTAMPTZ, succeeded BOOLEAN, failure_reason VARCHAR);
CREATE TABLE {schema}_raw.fx_rates (rate_date DATE, currency VARCHAR, eur_per_unit DECIMAL(12,6), PRIMARY KEY (rate_date, currency));
CREATE TABLE {schema}_raw.users (user_id BIGINT PRIMARY KEY, account_id INTEGER, role VARCHAR, invited_at TIMESTAMP, deactivated_at TIMESTAMP);
CREATE TABLE {schema}_raw.usage_weekly (account_id INTEGER, week_start DATE, active_users INTEGER, reconciliations_run INTEGER, ap_module_events INTEGER, PRIMARY KEY (account_id, week_start));
CREATE TABLE {schema}_raw.support_tickets (ticket_id BIGINT PRIMARY KEY, account_id INTEGER, opened_at TIMESTAMP, category VARCHAR, priority VARCHAR, resolved_at TIMESTAMP);
CREATE TABLE {schema}_raw.marketing_spend_monthly (month DATE, channel VARCHAR, spend_eur DECIMAL(12,2), PRIMARY KEY (month, channel));
CREATE TABLE {schema}_raw.leads (lead_id BIGINT PRIMARY KEY, created_at TIMESTAMP, source VARCHAR, segment VARCHAR, email VARCHAR);
CREATE TABLE {schema}_raw.opportunities (opportunity_id BIGINT PRIMARY KEY, lead_id BIGINT, account_id INTEGER, created_at TIMESTAMP, stage VARCHAR, closed_at TIMESTAMP, is_won BOOLEAN, amount_eur DECIMAL(12,2));
CREATE TABLE {schema}_raw.cogs_monthly (month DATE, cost_type VARCHAR, amount_eur DECIMAL(12,2), PRIMARY KEY (month, cost_type));
CREATE TABLE {schema}_raw.sm_expense_monthly (month DATE, channel VARCHAR, cost_type VARCHAR, amount_eur DECIMAL(12,2), PRIMARY KEY (month, channel, cost_type));
CREATE TABLE {schema}_raw.app_events (event_id BIGINT PRIMARY KEY, user_id BIGINT, account_id INTEGER, event_ts TIMESTAMPTZ, event_name VARCHAR);

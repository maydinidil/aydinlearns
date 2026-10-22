"""Sprint 6 Task G1: Mailvora (knowledge/05 CO-03, S6-20, E-196, E-086, E-107; rulings P31 to P34), as the generator returns it.

Each of 05's 15 findings is measured here in SQL, apart from the generator's own validate(), and held to 05's band. A finding
not about cleaning reads the clean tables (OD-GEN-01, E-093); the cleaning findings FIND-03-11 to -13 read raw. Each quirk exists
in raw and not in clean; P32: the refunds (Q-03-07) and the missing UTM fields of direct sessions are business states, in both.
The truth file records what the data holds, so each finding's measure is also compared with it. Assertions name data facts only.
"""
import datetime as dt
import json
import pathlib
import sys
import unittest
from unittest import mock

import duckdb
import pyarrow as pa

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from mailvora import generate as mv  # noqa: E402
from mailvora import notes as mv_notes  # noqa: E402
from mailvora import raw as mv_raw  # noqa: E402
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import mailvora_once  # noqa: E402

NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17
DDL = pathlib.Path(mv.__file__).resolve().parent / "ddl.sql"
# 05 CO-03's tables (DuckDB types), then S6-20's budget_monthly (MKT-02) and countries (E-107).
COLUMNS = {
    "channels": [("channel_id", "INTEGER"), ("channel_name", "VARCHAR"), ("channel_group", "VARCHAR"), ("cost_model", "VARCHAR")],
    "campaigns": [("campaign_id", "INTEGER"), ("channel_id", "INTEGER"), ("campaign_name", "VARCHAR"), ("utm_campaign", "VARCHAR"),
                  ("start_date", "DATE"), ("end_date", "DATE")],
    "ad_spend_daily": [("spend_date", "DATE"), ("campaign_id", "INTEGER"), ("impressions", "BIGINT"), ("clicks", "INTEGER"),
                       ("spend", "DECIMAL(12,2)"), ("currency", "VARCHAR"), ("export_timezone", "VARCHAR")],
    "fx_rates_monthly": [("month", "DATE"), ("currency", "VARCHAR"), ("eur_per_unit", "DECIMAL(12,6)")],
    "sessions": [("session_id", "BIGINT"), ("visitor_id", "VARCHAR"), ("session_start", "TIMESTAMP WITH TIME ZONE"),
                 ("utm_source", "VARCHAR"), ("utm_medium", "VARCHAR"), ("utm_campaign", "VARCHAR"), ("landing_page", "VARCHAR"),
                 ("device", "VARCHAR"), ("country_code", "VARCHAR")],
    "signups": [("user_id", "BIGINT"), ("visitor_id", "VARCHAR"), ("signup_ts", "TIMESTAMP WITH TIME ZONE"),
                ("country_code", "VARCHAR"), ("email_domain", "VARCHAR")],
    "activation_events": [("user_id", "BIGINT"), ("event_ts", "TIMESTAMP WITH TIME ZONE"), ("event_name", "VARCHAR")],
    "subscriptions": [("subscription_id", "BIGINT"), ("user_id", "BIGINT"), ("plan_name", "VARCHAR"), ("start_date", "DATE"),
                      ("end_date", "DATE"), ("monthly_price_eur", "DECIMAL(8,2)")],
    "payments": [("payment_id", "BIGINT"), ("subscription_id", "BIGINT"), ("paid_at", "TIMESTAMP WITH TIME ZONE"),
                 ("amount_eur", "DECIMAL(10,2)"), ("refunded", "BOOLEAN")],
    "budget_monthly": [("month", "DATE"), ("channel_id", "INTEGER"), ("budget_eur", "DECIMAL(12,2)")],
    "countries": [("country_code", "VARCHAR"), ("timezone", "VARCHAR")],
}
# 05 CO-03's row counts. payments is the one exception (see test_row_counts_follow_co_03).
VOLUMES = {"channels": 10, "campaigns": 180, "ad_spend_daily": 60_000, "fx_rates_monthly": 24, "sessions": 2_000_000,
           "signups": 120_000, "activation_events": 200_000, "subscriptions": 18_000}
# CO-03's primary keys (the clean tables); activation_events has none.
KEYS = {"channels": ["channel_id"], "campaigns": ["campaign_id"], "ad_spend_daily": ["spend_date", "campaign_id"],
        "fx_rates_monthly": ["month", "currency"], "sessions": ["session_id"], "signups": ["user_id"],
        "subscriptions": ["subscription_id"], "payments": ["payment_id"], "budget_monthly": ["month", "channel_id"],
        "countries": ["country_code"]}
# P31: mailvora_raw holds the quirk tables and unchanged copies of the tables a raw ticket joins; P37 adds signups, so
# FIND-03-11 can be computed on mailvora_raw alone.
RAW_TABLES = {"sessions", "ad_spend_daily", "payments", "channels", "campaigns", "fx_rates_monthly", "signups"}
UNCHANGED_RAW = ("payments", "channels", "campaigns", "fx_rates_monthly", "signups")
# The ten channels of CO-03 under their short names (S6-20, the report).
PAID = ["nonbrand_search", "brand_search", "meta", "linkedin", "youtube", "review_sites", "affiliates"]
UNPAID = ["organic", "direct", "referral"]
META_SPELLINGS = {"facebook", "Facebook", "fb", "meta", "ig"}              # 05 Q-03-01
META_MEDIUMS = {"paid_social", "Paid-Social", "cpc"}                      # 05 Q-03-01
WINDOW = (dt.date(2024, 1, 1), dt.date(2025, 12, 31))
FULL_WEEKS = ("DATE '2024-01-01'", "DATE '2025-12-22'")                  # the 104 Monday weeks the window holds whole
PAUSE = ("DATE '2025-05-05'", "DATE '2025-06-02'")                       # 05: brand search paused 2025-05-05 to 06-01
BEFORE = ("DATE '2025-04-07'", "DATE '2025-05-05'")                      # the 4 weeks before it
_GENERATED = None

# E-196: the channel rule, applied in SQL exactly as the sessions note states it.
CHANNEL_SQL = """CREATE TABLE {s}.session_channel AS
SELECT s.session_id, s.visitor_id, s.session_start, s.utm_campaign,
       CASE WHEN s.utm_campaign IS NOT NULL THEN ch.channel_name
            WHEN s.utm_medium = 'organic' THEN 'organic'
            WHEN s.utm_medium = 'referral' THEN 'referral'
            WHEN s.utm_source IS NULL AND s.utm_medium IS NULL THEN 'direct' END AS channel
FROM {s}.sessions s LEFT JOIN {s}.campaigns c ON c.utm_campaign = s.utm_campaign
LEFT JOIN {s}.channels ch ON ch.channel_id = c.channel_id"""
# Each signup's sessions before it, then its first touch, last touch, path and number of channels.
ATTRIBUTION_SQL = """CREATE TABLE attribution AS
WITH t AS (SELECT u.user_id, u.signup_ts, sc.channel, sc.session_start, sc.utm_campaign
           FROM clean.signups u JOIN clean.session_channel sc ON sc.visitor_id = u.visitor_id AND sc.session_start <= u.signup_ts)
SELECT user_id, any_value(signup_ts) AS signup_ts, arg_min(channel, session_start) AS ft, arg_max(channel, session_start) AS lt,
       arg_max_null(utm_campaign, session_start) AS lt_campaign, count(DISTINCT channel) AS channels,
       string_agg(channel, ' > ' ORDER BY session_start) AS path
FROM t GROUP BY user_id"""
# P37: the last touch on mailvora_raw alone. A session the rule cannot map (raw's empty strings) has no channel, and
# arg_max_null keeps it as the last touch (arg_max would skip it).
RAW_LAST_TOUCH_SQL = """CREATE TABLE raw_last_touch AS
SELECT u.user_id, any_value(u.signup_ts) AS signup_ts, arg_max_null(sc.channel, sc.session_start) AS lt
FROM raw.signups u JOIN raw.session_channel sc ON sc.visitor_id = u.visitor_id AND sc.session_start <= u.signup_ts
GROUP BY u.user_id"""
SPEND_SQL = """CREATE VIEW {s}.spend AS SELECT a.*, ch.channel_name, ch.channel_group FROM {s}.ad_spend_daily a
JOIN {s}.campaigns c USING (campaign_id) JOIN {s}.channels ch USING (channel_id)"""


def generated():
    """One generation shared by the test classes, with the build's validation run once."""
    global _GENERATED
    if _GENERATED is None:
        tables, truth, findings = mailvora_once.generated()      # S7-30: the one generation the builds share too
        _GENERATED = (tables, {**truth, "findings": findings})
    return _GENERATED


def connect(tables: dict) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect(config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    for schema in ("clean", "raw"):
        con.execute(f"CREATE SCHEMA {schema}")
        for name, table in tables[schema].items():
            con.register("src", table)
            con.execute(f"CREATE TABLE {schema}.{name} AS SELECT * FROM src")
            con.unregister("src")
    for schema in ("clean", "raw"):
        con.execute(CHANNEL_SQL.format(s=schema))
        con.execute(SPEND_SQL.format(s=schema))
    con.execute(ATTRIBUTION_SQL)
    con.execute(RAW_LAST_TOUCH_SQL)
    return con


class Fixture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tables, cls.truth = generated()
        cls.clean, cls.raw = cls.tables["clean"], cls.tables["raw"]
        cls.con = connect(cls.tables)

    @classmethod
    def tearDownClass(cls):
        cls.con.close()

    def one(self, sql, params=None):
        return self.con.execute(sql, params or []).fetchone()

    def rows(self, sql, params=None):
        return self.con.execute(sql, params or []).fetchall()

    def found(self, finding):
        f = self.truth["findings"][finding]
        self.assertIs(f["pass"], True, finding)
        return f


class Tables(Fixture):
    def test_seed_and_generation_order(self):
        self.assertEqual(mv.SEED, 3303)
        # 05's CO-03 generation order, then S6-20's two tables appended (GEN-02: new tables go at the end).
        self.assertEqual(mv.TABLE_ORDER, ["calendar", "fx_rates_monthly", "channels", "campaigns", "ad_spend_daily",
                                          "daily_signups_model", "sessions", "signups", "activation_events", "subscriptions",
                                          "payments", "quirks", "budget_monthly", "countries"])
        self.assertEqual(self.truth["seed"], 3303)
        self.assertEqual(self.truth["company"], "mailvora")

    def test_clean_tables_have_co_03_columns(self):
        self.assertEqual(set(self.clean), set(COLUMNS))
        self.assertEqual(list(mv.CLEAN_TABLES), list(COLUMNS), "CO-03's order, then budget_monthly and countries")
        for name, cols in COLUMNS.items():
            got = self.rows("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'clean' "
                            "AND table_name = ? ORDER BY ordinal_position", [name])
            self.assertEqual(got, cols, name)

    def test_raw_holds_p31_tables_with_the_clean_columns(self):
        self.assertEqual(set(self.raw), RAW_TABLES)
        self.assertEqual(set(mv_raw.RAW_TABLES), RAW_TABLES)
        for name, table in self.raw.items():
            self.assertEqual(table.schema, self.clean[name].schema, f"raw {name} has the clean columns and types")
        for name in UNCHANGED_RAW:
            self.assertTrue(self.raw[name].equals(self.clean[name]), f"raw {name} is an unchanged copy")

    def test_row_counts_follow_co_03(self):
        for name, rows in VOLUMES.items():
            got = self.clean[name].num_rows
            self.assertTrue(0.9 * rows <= got <= 1.1 * rows, f"{name}: {got} rows, CO-03 gives {rows}")
        self.assertEqual(self.clean["budget_monthly"].num_rows, 7 * 24, "7 paid channels x 24 months")
        self.assertEqual(self.clean["countries"].num_rows, len(mv.COUNTRIES))
        # payments: CO-03 gives 200,000, but its own funnel caps the paying months. 120,000 signups, 45% activated and 20% of
        # them paying give about 11,000 payers; with 5% monthly churn and a start spread over the 24 months, a payer pays about
        # 9 monthly plan fees inside the window, so about 100,000 payments (the report asks for a ruling).
        payers = self.one("SELECT count(DISTINCT user_id) FROM clean.subscriptions")[0]
        got = self.clean["payments"].num_rows
        self.assertTrue(80_000 <= got <= 125_000, f"payments: {got}")
        self.assertTrue(7 <= got / payers <= 11, f"payments per payer: {got / payers:.2f}")

    def test_keys_are_unique(self):
        for name, key in KEYS.items():
            rows, distinct, missing = self.one(f"SELECT count(*), count(DISTINCT ({', '.join(key)})), "
                                               f"count(*) - count({key[0]}) FROM clean.{name}")
            self.assertEqual((rows, missing), (distinct, 0), f"{name}: {key} is unique and never missing")
        self.assertEqual(self.one("SELECT count(*) - count(DISTINCT utm_campaign) FROM clean.campaigns")[0], 0,
                         "each campaign has its own utm_campaign")
        self.assertEqual(self.one("SELECT count(*) - count(DISTINCT channel_name) FROM clean.channels")[0], 0)

    def test_every_link_meets_a_row(self):
        links = [("campaigns", "channel_id", "channels", "channel_id"), ("ad_spend_daily", "campaign_id", "campaigns", "campaign_id"),
                 ("activation_events", "user_id", "signups", "user_id"), ("subscriptions", "user_id", "signups", "user_id"),
                 ("payments", "subscription_id", "subscriptions", "subscription_id"),
                 ("budget_monthly", "channel_id", "channels", "channel_id"),
                 ("sessions", "country_code", "countries", "country_code"), ("signups", "country_code", "countries", "country_code"),
                 ("signups", "visitor_id", "sessions", "visitor_id")]
        for table, column, ref, ref_column in links:
            orphans = self.one(f"""SELECT count(*) FROM clean.{table} x WHERE x.{column} IS NULL OR NOT EXISTS
                                   (SELECT 1 FROM clean.{ref} r WHERE r.{ref_column} = x.{column})""")[0]
            self.assertEqual(orphans, 0, f"{table}.{column} always meets {ref}.{ref_column}")

    def test_channels_and_campaigns(self):
        names = [r[0] for r in self.rows("SELECT channel_name FROM clean.channels ORDER BY channel_id")]
        self.assertEqual(names, PAID + UNPAID)
        unpaid = {r[0] for r in self.rows("SELECT channel_name FROM clean.channels WHERE channel_group = 'unpaid'")}
        self.assertEqual(unpaid, set(UNPAID))
        self.assertEqual(self.one("SELECT count(*) FROM clean.campaigns c JOIN clean.channels ch USING (channel_id) "
                                  "WHERE ch.channel_group = 'unpaid'")[0], 0, "only paid channels run campaigns")
        self.assertEqual(self.one("SELECT count(DISTINCT channel_id) FROM clean.campaigns")[0], len(PAID))

    def test_data_window_and_spend_per_day_in_euros(self):
        # E-086: spend is stored per day, and in euros in the clean tables, with currency and export_timezone kept (P33's note).
        first, last, currencies, zones = self.one("""SELECT min(spend_date), max(spend_date), list(DISTINCT currency),
                                                     list(DISTINCT export_timezone) FROM clean.ad_spend_daily""")
        self.assertEqual((first, last), WINDOW)
        self.assertEqual((currencies, zones), (["EUR"], ["UTC"]))
        outside = self.one("""SELECT (SELECT count(*) FROM clean.sessions WHERE CAST(session_start AS DATE) NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-31')
                                   + (SELECT count(*) FROM clean.signups WHERE CAST(signup_ts AS DATE) NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-31')
                                   + (SELECT count(*) FROM clean.payments WHERE CAST(paid_at AS DATE) NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-31')
                                   + (SELECT count(*) FROM clean.activation_events WHERE CAST(event_ts AS DATE) NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-31')""")[0]
        self.assertEqual(outside, 0, "every event falls in 2024-01-01 to 2025-12-31")
        months = self.rows("SELECT month, currency FROM clean.fx_rates_monthly ORDER BY 1")
        self.assertEqual([m for m, _ in months], [dt.date(2024 + i // 12, i % 12 + 1, 1) for i in range(24)])
        self.assertEqual({c for _, c in months}, {"USD"})
        low, high = self.one("SELECT min(eur_per_unit), max(eur_per_unit) FROM clean.fx_rates_monthly")
        self.assertTrue(0.86 <= float(low) and float(high) <= 0.93, "05: USD/EUR monthly rates 0.86 to 0.93")

    def test_paid_sessions_fall_on_a_day_their_campaign_had_clicks(self):
        missing = self.one("""SELECT count(*) FROM clean.sessions s JOIN clean.campaigns c USING (utm_campaign)
                              WHERE NOT EXISTS (SELECT 1 FROM clean.ad_spend_daily a WHERE a.campaign_id = c.campaign_id
                                                AND a.spend_date = CAST(s.session_start AS DATE) AND a.clicks > 0)""")[0]
        self.assertEqual(missing, 0, "a session from a campaign is a click, on a UTC day that campaign had clicks")

    def test_the_funnel_is_cumulative(self):
        # E-012: a step counts only when every earlier step's flag is true, so every payer activated, after signing up.
        unactivated = self.one("""SELECT count(*) FROM (SELECT DISTINCT user_id FROM clean.subscriptions)
                                  WHERE user_id NOT IN (SELECT user_id FROM clean.activation_events)""")[0]
        self.assertEqual(unactivated, 0, "every payer activated")
        early = self.one("""SELECT count(*) FROM clean.activation_events e JOIN clean.signups u USING (user_id)
                            WHERE e.event_ts < u.signup_ts""")[0]
        self.assertEqual(early, 0, "no activation before signup")
        first = self.one("""SELECT count(*) FROM (SELECT user_id, arg_min(event_name, event_ts) AS first, count(*) FILTER (WHERE event_name = 'first_campaign_sent') AS n
                            FROM clean.activation_events GROUP BY 1) WHERE first <> 'first_campaign_sent' OR n <> 1""")[0]
        self.assertEqual(first, 0, "each activated user's first event is their one first_campaign_sent")
        paid_before = self.one("""SELECT count(*) FROM clean.subscriptions s JOIN (SELECT user_id, min(event_ts) AS a FROM clean.activation_events GROUP BY 1) e
                                  USING (user_id) WHERE s.start_date < CAST(e.a AS DATE)""")[0]
        self.assertEqual(paid_before, 0, "no subscription starts before activation")

    def test_subscriptions_and_payments_agree(self):
        prices = dict(self.rows("SELECT DISTINCT plan_name, monthly_price_eur FROM clean.subscriptions"))
        self.assertEqual({k: float(v) for k, v in prices.items()}, {"Lite": 15.0, "Pro": 45.0, "Business": 120.0})
        bad = self.one("""SELECT count(*) FROM clean.payments p JOIN clean.subscriptions s USING (subscription_id)
                          WHERE p.amount_eur <> s.monthly_price_eur OR CAST(p.paid_at AS DATE) < s.start_date
                             OR (s.end_date IS NOT NULL AND CAST(p.paid_at AS DATE) > s.end_date)""")[0]
        self.assertEqual(bad, 0, "each payment is its plan's monthly fee, inside the subscription")
        overlap = self.one("""SELECT count(*) FROM clean.subscriptions a JOIN clean.subscriptions b ON a.user_id = b.user_id
                              AND a.subscription_id < b.subscription_id AND b.start_date <= coalesce(a.end_date, DATE '9999-12-31')
                              AND a.start_date <= coalesce(b.end_date, DATE '9999-12-31')""")[0]
        self.assertEqual(overlap, 0, "a user holds one subscription at a time")

    def test_countries_name_a_time_zone_duckdb_knows(self):
        # E-107: FIND-03-14's local time comes from countries.timezone.
        rows = self.rows("SELECT country_code, timezone FROM clean.countries ORDER BY 1")
        self.assertEqual([c for c, _ in rows], sorted(mv.COUNTRIES))
        for code, zone in rows:
            offset = self.one(f"SELECT date_diff('hour', TIMESTAMP '2025-01-15 12:00:00', "
                              f"timezone('{zone}', TIMESTAMPTZ '2025-01-15 12:00:00+00'))")[0]
            self.assertIn(offset, (0, 1, 2), f"{code}: {zone} is a European zone DuckDB knows")


class ChannelRule(Fixture):
    def test_every_clean_session_maps_to_exactly_one_channel(self):
        # E-196: through utm_campaign to campaigns, or the stated rule for organic, referral and direct; never both, never none.
        bad = self.one("""WITH m AS (SELECT s.session_id,
                (SELECT count(*) FROM clean.campaigns c WHERE c.utm_campaign = s.utm_campaign)
                + CASE WHEN s.utm_campaign IS NULL AND s.utm_medium = 'organic' THEN 1 ELSE 0 END
                + CASE WHEN s.utm_campaign IS NULL AND s.utm_medium = 'referral' THEN 1 ELSE 0 END
                + CASE WHEN s.utm_source IS NULL AND s.utm_medium IS NULL AND s.utm_campaign IS NULL THEN 1 ELSE 0 END AS rules
              FROM clean.sessions s)
            SELECT count(*) FILTER (WHERE rules <> 1) FROM m""")[0]
        self.assertEqual(bad, 0)
        self.assertEqual(self.one("SELECT count(*) FROM clean.session_channel WHERE channel IS NULL")[0], 0)
        self.assertEqual({r[0] for r in self.rows("SELECT DISTINCT channel FROM clean.session_channel")}, set(PAID + UNPAID))

    def test_the_rule_is_written_once_in_the_sessions_note(self):
        rule = mv_notes.CHANNEL_RULE
        for words in ("utm_campaign", "campaigns", "organic", "referral", "direct", "missing"):
            self.assertIn(words, rule)
        self.assertNotIn("NULL", rule)
        self.assertEqual(sum(text == rule for notes in mv_notes.COLUMN_NOTES.values() for text in notes.values()), 1)
        self.assertEqual(mv_notes.COLUMN_NOTES["sessions"]["utm_campaign"], rule)

    def test_first_and_last_touch_are_unique(self):
        # P34: no visitor has two sessions that start at the same instant, so first and last touch have one answer each.
        ties = self.one("SELECT count(*) FROM (SELECT visitor_id, session_start FROM clean.sessions GROUP BY ALL HAVING count(*) > 1)")[0]
        self.assertEqual(ties, 0)
        self.assertEqual(self.one("SELECT count(*) FROM attribution")[0], self.clean["signups"].num_rows,
                         "every signup has a session before it")


class Findings(Fixture):
    """One test per finding of 05 CO-03, each with 05's validation band."""

    def channel_value(self, sql):
        return {k: float(v) for k, v in self.rows(sql)}

    def test_find_03_01_meta_and_nonbrand_take_about_65_percent_of_2025_spend(self):
        share = float(self.one("""SELECT sum(spend) FILTER (WHERE channel_name IN ('meta', 'nonbrand_search')) / sum(spend)
                                  FROM clean.spend WHERE year(spend_date) = 2025""")[0])
        self.assertTrue(0.60 <= share <= 0.70)
        self.assertAlmostEqual(self.found("FIND-03-01")["share"], share, places=3)

    def test_find_03_02_linkedin_has_the_highest_cpc_and_review_sites_the_highest_ctr(self):
        cpc = self.channel_value("SELECT channel_name, sum(spend) / NULLIF(sum(clicks), 0) FROM clean.spend GROUP BY 1")
        ctr = self.channel_value("SELECT channel_name, sum(clicks) / sum(impressions) FROM clean.spend GROUP BY 1")
        self.assertEqual(max(cpc, key=cpc.get), "linkedin")
        self.assertEqual(max(ctr, key=ctr.get), "review_sites")
        self.assertTrue(5.0 <= cpc["linkedin"] <= 7.0, "about 6 EUR")
        f = self.found("FIND-03-02")
        self.assertEqual((f["top_cpc"], f["top_ctr"]), ("linkedin", "review_sites"))

    def test_find_03_03_funnel_and_affiliates_break_the_pattern(self):
        signups, activated, paid = self.one("""SELECT count(*), count(*) FILTER (WHERE a), count(*) FILTER (WHERE a AND p) FROM (
            SELECT u.user_id, u.user_id IN (SELECT user_id FROM clean.activation_events) AS a,
                   u.user_id IN (SELECT user_id FROM clean.subscriptions) AS p FROM clean.signups u)""")
        self.assertTrue(0.40 <= activated / signups <= 0.50)
        self.assertTrue(0.17 <= paid / activated <= 0.23)
        by_channel = self.channel_value("""SELECT a.lt, avg(CASE WHEN a.user_id IN (SELECT user_id FROM clean.activation_events) THEN 1 ELSE 0 END)
                                           FROM attribution a GROUP BY 1""")
        self.assertEqual(min(by_channel, key=by_channel.get), "affiliates", "affiliates break the pattern")
        f = self.found("FIND-03-03")
        self.assertAlmostEqual(f["signup_to_activation"], activated / signups, places=3)
        self.assertAlmostEqual(f["activation_to_paid"], paid / activated, places=3)

    def test_find_03_04_review_sites_high_roas_low_share(self):
        revenue, spend = self.one("""SELECT
                (SELECT sum(p.amount_eur) FROM attribution a JOIN clean.subscriptions s USING (user_id)
                 JOIN clean.payments p USING (subscription_id)
                 WHERE a.lt = 'review_sites' AND a.signup_ts < TIMESTAMPTZ '2025-10-01 00:00:00+00' AND NOT p.refunded
                   AND p.paid_at < a.signup_ts + INTERVAL 90 DAY),
                (SELECT sum(spend) FROM clean.spend WHERE channel_name = 'review_sites' AND spend_date < DATE '2025-10-01')""")
        roas = float(revenue / spend)
        share = float(self.one("""SELECT avg(CASE WHEN lt = 'review_sites' THEN 1 ELSE 0 END) FROM attribution
                                  WHERE lt IN (SELECT channel_name FROM clean.channels WHERE channel_group <> 'unpaid')""")[0])
        self.assertGreaterEqual(roas, 3.5)
        self.assertLessEqual(share, 0.04)
        f = self.found("FIND-03-04")
        self.assertAlmostEqual(f["roas"], roas, places=2)
        self.assertAlmostEqual(f["share_of_paid_channel_signups"], share, places=3)

    def test_find_03_05_meta_marginal_cpa_doubles_above_18000_a_week(self):
        below, above, n_below, n_above = self.one(f"""WITH w AS (SELECT CAST(date_trunc('week', spend_date) AS DATE) AS wk, sum(spend) AS spend
                                                                  FROM clean.spend WHERE channel_name = 'meta' GROUP BY 1),
                s AS (SELECT CAST(date_trunc('week', signup_ts) AS DATE) AS wk, count(*) AS n FROM attribution WHERE lt = 'meta' GROUP BY 1),
                j AS (SELECT w.spend, coalesce(s.n, 0) AS n FROM w LEFT JOIN s USING (wk) WHERE w.wk BETWEEN {FULL_WEEKS[0]} AND {FULL_WEEKS[1]})
            SELECT regr_slope(n, spend) FILTER (WHERE spend < 18000), regr_slope(n, spend) FILTER (WHERE spend >= 18000),
                   count(*) FILTER (WHERE spend < 18000), count(*) FILTER (WHERE spend >= 18000) FROM j""")
        self.assertGreaterEqual(min(n_below, n_above), 15, "enough weeks on each side of 18,000 EUR")
        ratio = below / above                     # marginal CPA (1 / slope) above over below
        self.assertGreaterEqual(ratio, 1.8)
        self.assertAlmostEqual(self.found("FIND-03-05")["ratio"], ratio, places=2)

    def test_find_03_06_organic_and_direct_rise_1_to_3_weeks_after_youtube(self):
        corr = self.one(f"""WITH weeks AS (SELECT CAST(range AS DATE) AS wk FROM range({FULL_WEEKS[0]}, DATE '2025-12-29', INTERVAL 7 DAY)),
                yt AS (SELECT CAST(date_trunc('week', spend_date) AS DATE) AS wk, sum(spend) AS y FROM clean.spend
                       WHERE channel_name = 'youtube' GROUP BY 1),
                od AS (SELECT CAST(date_trunc('week', signup_ts) AS DATE) AS wk, count(*) AS n FROM attribution
                       WHERE lt IN ('organic', 'direct') GROUP BY 1),
                j AS (SELECT weeks.wk, coalesce(od.n, 0) AS n, coalesce(yt.y, 0) AS y FROM weeks LEFT JOIN od USING (wk) LEFT JOIN yt USING (wk)),
                l AS (SELECT n, y, lag(y, 1) OVER w AS y1, lag(y, 2) OVER w AS y2, lag(y, 3) OVER w AS y3, lag(y, 4) OVER w AS y4
                      FROM j WINDOW w AS (ORDER BY wk))
            SELECT corr(n, y), corr(n, y1), corr(n, y2), corr(n, y3), corr(n, y4) FROM l""")
        self.assertGreater(max(corr[1], corr[2]), corr[0] + 0.15)
        found = self.found("FIND-03-06")["corr_by_lag"]
        for k in range(5):
            self.assertAlmostEqual(found[k], corr[k], places=3)

    def test_find_03_07_organic_and_direct_recover_about_80_percent_of_paused_brand(self):
        bb, bd, ob, od = self.one(f"""SELECT
                count(*) FILTER (WHERE lt = 'brand_search' AND d >= {BEFORE[0]} AND d < {BEFORE[1]}),
                count(*) FILTER (WHERE lt = 'brand_search' AND d >= {PAUSE[0]} AND d < {PAUSE[1]}),
                count(*) FILTER (WHERE lt IN ('organic', 'direct') AND d >= {BEFORE[0]} AND d < {BEFORE[1]}),
                count(*) FILTER (WHERE lt IN ('organic', 'direct') AND d >= {PAUSE[0]} AND d < {PAUSE[1]})
            FROM (SELECT lt, CAST(signup_ts AS DATE) AS d FROM attribution)""")
        self.assertEqual(bd, 0, "no brand search signups while it is paused")
        recovery = (od - ob) / (bb - bd)
        self.assertTrue(0.7 <= recovery <= 0.9)
        self.assertAlmostEqual(self.found("FIND-03-07")["recovery"], recovery, places=3)
        paused = self.one(f"""SELECT count(*) FROM clean.spend WHERE channel_name = 'brand_search'
                              AND spend_date >= {PAUSE[0]} AND spend_date < {PAUSE[1]}""")[0]
        self.assertEqual(paused, 0, "no brand spend while paused")

    def test_find_03_08_dealhub_signups_rarely_activate_and_use_disposable_domains(self):
        activation, disposable = self.one(f"""SELECT avg(CASE WHEN a.user_id IN (SELECT user_id FROM clean.activation_events) THEN 1 ELSE 0 END),
                avg(CASE WHEN u.email_domain IN ({', '.join(repr(d) for d in mv.DISPOSABLE_DOMAINS)}) THEN 1 ELSE 0 END)
            FROM attribution a JOIN clean.signups u USING (user_id) WHERE a.lt_campaign LIKE '%dealhub%'""")
        self.assertLess(activation, 0.08)
        self.assertGreaterEqual(disposable, 0.5)
        low = {r[0] for r in self.rows("""SELECT lt_campaign FROM attribution WHERE lt_campaign IS NOT NULL GROUP BY 1
            HAVING count(*) >= 50 AND avg(CASE WHEN user_id IN (SELECT user_id FROM clean.activation_events) THEN 1 ELSE 0 END) < 0.1""")}
        self.assertTrue(low and all("dealhub" in c for c in low), "only dealhub's campaigns activate under 10%")
        f = self.found("FIND-03-08")
        self.assertAlmostEqual(f["dealhub_activation"], activation, places=3)
        self.assertAlmostEqual(f["disposable_share"], disposable, places=3)

    def test_find_03_09_six_month_revenue_per_payer_highest_for_organic_and_review_sites_lowest_for_meta(self):
        rows = self.rows("""WITH pay AS (SELECT s.user_id, p.paid_at, p.amount_eur, p.refunded FROM clean.payments p
                                         JOIN clean.subscriptions s USING (subscription_id)),
                f AS (SELECT user_id, min(paid_at) AS first_paid FROM pay GROUP BY 1 HAVING min(paid_at) < TIMESTAMPTZ '2025-07-01 00:00:00+00'),
                r AS (SELECT f.user_id, coalesce(sum(p.amount_eur) FILTER (WHERE NOT p.refunded AND p.paid_at < f.first_paid + INTERVAL 180 DAY), 0) AS rev
                      FROM f JOIN pay p USING (user_id) GROUP BY 1)
            SELECT a.lt, avg(r.rev), count(*) FROM r JOIN attribution a USING (user_id) GROUP BY 1""")
        per = {lt: float(v) for lt, v, n in rows if n >= 30}
        ranked = sorted(per, key=per.get, reverse=True)
        self.assertEqual(set(ranked[:2]), {"organic", "review_sites"})
        self.assertEqual(ranked[-1], "meta")
        self.assertGreater(per["organic"], 1.3 * per["meta"])
        self.assertAlmostEqual(self.found("FIND-03-09")["organic_over_meta"], per["organic"] / per["meta"], places=3)

    def test_find_03_10_first_and_last_touch_cac_differ_by_over_40_percent_for_youtube_and_meta(self):
        f = self.found("FIND-03-10")
        for channel in ("youtube", "meta"):
            spend, ft, lt = self.one(f"""SELECT (SELECT sum(spend) FROM clean.spend WHERE channel_name = '{channel}'),
                (SELECT count(*) FROM attribution WHERE ft = '{channel}'), (SELECT count(*) FROM attribution WHERE lt = '{channel}')""")
            gap = abs((float(spend) / ft) / (float(spend) / lt) - 1)
            self.assertGreater(gap, 0.4, channel)
            self.assertAlmostEqual(f[channel]["gap"], gap, places=3)

    LINKEDIN_DAYS = """WITH li AS (SELECT spend_date + {shift} AS d, sum(spend) AS spend FROM raw.spend
                                   WHERE channel_name = 'linkedin' GROUP BY 1),
                su AS (SELECT CAST(signup_ts AS DATE) AS d, count(*) AS n FROM raw_last_touch WHERE lt = 'linkedin' GROUP BY 1)
            SELECT li.d, li.spend, coalesce(su.n, 0) AS n FROM li LEFT JOIN su USING (d)
            WHERE li.d BETWEEN DATE '2024-01-01' AND DATE '2025-12-31'"""

    def linkedin_monday_ratio(self, shift):
        return float(self.one(f"""WITH j AS ({self.LINKEDIN_DAYS.format(shift=shift)})
            SELECT (sum(spend) FILTER (WHERE dayofweek(d) = 1) / sum(n) FILTER (WHERE dayofweek(d) = 1))
                 / (sum(spend) FILTER (WHERE dayofweek(d) <> 1) / sum(n) FILTER (WHERE dayofweek(d) <> 1)) FROM j""")[0])

    def linkedin_weekday_cpa(self, shift):
        """Each weekday's CPA (its spend summed over its signups summed) over the pooled CPA."""
        rows = self.rows(f"""WITH j AS ({self.LINKEDIN_DAYS.format(shift=shift)})
            SELECT dayofweek(d), (sum(spend) / sum(n)) / (SELECT sum(spend) / sum(n) FROM j) FROM j GROUP BY 1""")
        return {dow: float(v) for dow, v in rows}

    def test_find_03_11_linkedin_monday_cpa_spikes_are_the_los_angeles_export_day(self):
        # P33: raw LinkedIn rows carry the Los Angeles date on which their UTC day began, the day before; the rule adds one day.
        # P37: computed on mailvora_raw alone (raw signups, raw sessions mapped by the channel rule).
        raw, fixed = self.linkedin_monday_ratio(0), self.linkedin_monday_ratio(1)
        self.assertGreater(raw, 1.4)
        self.assertLess(fixed, 1.1)
        by_day = self.linkedin_weekday_cpa(0)
        self.assertEqual(len(by_day), 7)
        self.assertEqual(max(by_day, key=by_day.get), 1, "on raw, Monday has the highest weekday CPA")
        fixed_by_day = self.linkedin_weekday_cpa(1)
        self.assertTrue(all(0.9 <= v <= 1.1 for v in fixed_by_day.values()), "after the rule, every weekday is near the pooled CPA")
        f = self.found("FIND-03-11")
        self.assertAlmostEqual(f["raw_monday_ratio"], raw, places=3)
        self.assertAlmostEqual(f["fixed_monday_ratio"], fixed, places=3)
        self.assertEqual(f["raw_highest_weekday"], 1)
        self.assertIs(f["fixed_weekdays_within_band"], True)
        definition = self.truth["definitions"]["FIND-03-11"]
        for words in ("CPA", "each weekday", "mailvora_raw"):
            self.assertIn(words, definition)
        differ = self.one("""SELECT count(*) FROM raw_last_touch r JOIN attribution a USING (user_id)
                             WHERE (r.lt IS NOT DISTINCT FROM 'linkedin') <> (a.lt = 'linkedin')""")[0]
        self.assertEqual(differ, 0, "raw alone finds the same LinkedIn last touches as clean")

    def test_find_03_12_meta_traffic_splits_over_5_spellings(self):
        spellings = {r[0] for r in self.rows("""SELECT DISTINCT s.utm_source FROM raw.sessions s JOIN raw.campaigns c USING (utm_campaign)
                                                JOIN raw.channels ch USING (channel_id) WHERE ch.channel_name = 'meta'""")}
        self.assertEqual(spellings, META_SPELLINGS)
        mapped, naive = self.one("""SELECT avg(CASE WHEN lower(trim(utm_source)) IN ('facebook', 'fb', 'meta', 'ig') THEN 1 ELSE 0 END),
                                           avg(CASE WHEN utm_source = 'facebook' THEN 1 ELSE 0 END) FROM raw.sessions""")
        self.assertTrue(0.21 <= mapped <= 0.27)
        self.assertTrue(0.08 <= naive <= 0.14, "one spelling alone shows about 11%")
        f = self.found("FIND-03-12")
        self.assertEqual(f["spellings"], 5)
        self.assertAlmostEqual(f["mapped_share"], mapped, places=3)

    def test_find_03_13_converting_linkedin_usd_lowers_its_total(self):
        eur, naive = self.one("""SELECT sum(a.spend * fx.eur_per_unit), sum(a.spend) FROM raw.spend a
                                 JOIN raw.fx_rates_monthly fx ON fx.month = date_trunc('month', a.spend_date + 1) AND fx.currency = a.currency
                                 WHERE a.channel_name = 'linkedin'""")
        ratio = float(eur / naive)
        self.assertTrue(0.86 <= ratio <= 0.93)
        clean = self.one("SELECT sum(spend) FROM clean.spend WHERE channel_name = 'linkedin'")[0]
        rows = self.one("SELECT count(*) FROM clean.spend WHERE channel_name = 'linkedin'")[0]
        self.assertLessEqual(abs(float(eur) - float(clean)), 0.005 * rows, "converted on the UTC day, raw gives the clean euros")
        self.assertAlmostEqual(self.found("FIND-03-13")["ratio"], ratio, places=4)

    def test_find_03_14_signups_peak_tuesday_wednesday_10_to_11_local_meta_skews_to_weekends(self):
        self.con.execute("""CREATE OR REPLACE TEMP TABLE local_signups AS SELECT a.lt, u.signup_ts AT TIME ZONE c.timezone AS local_ts
                            FROM clean.signups u JOIN clean.countries c USING (country_code) JOIN attribution a USING (user_id)""")
        dow = self.one("SELECT dayofweek(local_ts) FROM local_signups GROUP BY 1 ORDER BY count(*) DESC LIMIT 1")[0]
        hour = self.one("SELECT hour(local_ts) FROM local_signups GROUP BY 1 ORDER BY count(*) DESC LIMIT 1")[0]
        overall, meta = self.one("""SELECT avg(CASE WHEN dayofweek(local_ts) IN (0, 6) THEN 1 ELSE 0 END),
                                           avg(CASE WHEN dayofweek(local_ts) IN (0, 6) THEN 1 ELSE 0 END) FILTER (WHERE lt = 'meta')
                                    FROM local_signups""")
        self.assertIn(dow, (2, 3))
        self.assertIn(hour, (10, 11))
        self.assertGreater(meta, overall + 0.1)
        f = self.found("FIND-03-14")
        self.assertEqual((f["modal_dow"], f["modal_hour"]), (dow, hour))

    def test_find_03_15_about_35_percent_of_payers_touched_two_or_more_channels(self):
        share = float(self.one("""SELECT avg(CASE WHEN channels >= 2 THEN 1 ELSE 0 END) FROM attribution WHERE user_id IN
            (SELECT s.user_id FROM clean.subscriptions s JOIN clean.payments p USING (subscription_id))""")[0])
        self.assertTrue(0.30 <= share <= 0.40)
        path = self.one("""SELECT path FROM attribution WHERE channels >= 2 AND user_id IN
            (SELECT s.user_id FROM clean.subscriptions s JOIN clean.payments p USING (subscription_id))
            GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1""")[0]
        self.assertEqual(path, "youtube > brand_search", "the typical path")
        f = self.found("FIND-03-15")
        self.assertAlmostEqual(f["multi_channel_share"], share, places=3)
        self.assertEqual(f["modal_path"], path)

    def test_the_truth_records_all_15_findings_with_definitions(self):
        names = [f"FIND-03-{i:02d}" for i in range(1, 16)]
        self.assertTrue(set(names) <= set(self.truth["findings"]))
        self.assertTrue(all(self.truth["findings"][n]["pass"] is True for n in names))
        self.assertTrue(set(names) <= set(self.truth["definitions"]))
        json.dumps(self.truth)                    # JSON-safe as written


class Quirks(Fixture):
    """GEN-04 and GEN-06: each quirk exists in raw and not in clean."""

    def test_q03_01_meta_source_and_medium_spellings(self):
        clean = self.rows("""SELECT DISTINCT s.utm_source, s.utm_medium FROM clean.sessions s JOIN clean.campaigns c USING (utm_campaign)
                             JOIN clean.channels ch USING (channel_id) WHERE ch.channel_name = 'meta'""")
        self.assertEqual(clean, [("facebook", "paid_social")], "clean: one spelling")
        mediums = {r[0] for r in self.rows("""SELECT DISTINCT s.utm_medium FROM raw.sessions s JOIN raw.campaigns c USING (utm_campaign)
                                              JOIN raw.channels ch USING (channel_id) WHERE ch.channel_name = 'meta'""")}
        self.assertEqual(mediums, META_MEDIUMS)
        respelled = self.one("""SELECT count(*) FROM raw.sessions r JOIN clean.sessions c USING (session_id)
                                WHERE r.utm_source IS DISTINCT FROM c.utm_source OR r.utm_medium IS DISTINCT FROM c.utm_medium""")[0]
        self.assertEqual(respelled, self.truth["planted"]["raw"]["Q-03-01"]["count"] + self.truth["planted"]["raw"]["Q-03-06"]["count"])
        # P34: one spelling per source in clean.
        clashes = self.one("""SELECT count(*) FROM (SELECT lower(trim(utm_source)) FROM (SELECT DISTINCT utm_source FROM clean.sessions
                              WHERE utm_source IS NOT NULL) GROUP BY 1 HAVING count(*) > 1)""")[0]
        self.assertEqual(clashes, 0)

    def raw_linkedin(self):
        return """FROM raw.ad_spend_daily r JOIN raw.campaigns c USING (campaign_id) JOIN raw.channels ch USING (channel_id)
                  WHERE ch.channel_name = 'linkedin'"""

    def test_q03_02_linkedin_rows_carry_the_los_angeles_day(self):
        zones = {r[0] for r in self.rows(f"SELECT DISTINCT r.export_timezone {self.raw_linkedin()}")}
        self.assertEqual(zones, {"America/Los_Angeles"})
        others = {r[0] for r in self.rows("""SELECT DISTINCT r.export_timezone FROM raw.ad_spend_daily r JOIN raw.campaigns c USING (campaign_id)
                                             JOIN raw.channels ch USING (channel_id) WHERE ch.channel_name <> 'linkedin'""")}
        self.assertEqual(others, {"UTC"})
        rows, matched = self.one(f"""SELECT count(*), count(*) FILTER (WHERE EXISTS (SELECT 1 FROM clean.ad_spend_daily k
                WHERE k.campaign_id = r.campaign_id AND k.spend_date = r.spend_date + 1 AND k.clicks = r.clicks AND k.impressions = r.impressions))
            {self.raw_linkedin()}""")
        self.assertEqual(matched, rows, "each raw LinkedIn row is its clean row, dated one day earlier")
        self.assertEqual(rows, self.truth["planted"]["raw"]["Q-03-02"]["count"])

    def test_q03_03_linkedin_spend_in_usd(self):
        currencies = {r[0] for r in self.rows(f"SELECT DISTINCT r.currency {self.raw_linkedin()}")}
        self.assertEqual(currencies, {"USD"})
        off = self.one("""SELECT count(*) FILTER (WHERE abs(r.spend * fx.eur_per_unit - k.spend) > 0.005)
            FROM raw.ad_spend_daily r JOIN raw.campaigns c USING (campaign_id) JOIN raw.channels ch USING (channel_id)
            JOIN clean.ad_spend_daily k ON k.campaign_id = r.campaign_id AND k.spend_date = r.spend_date + 1
            JOIN raw.fx_rates_monthly fx ON fx.month = date_trunc('month', k.spend_date) AND fx.currency = r.currency
            WHERE ch.channel_name = 'linkedin'""")[0]
        self.assertEqual(off, 0, "USD times the month's rate gives the clean euros, to the cent")
        self.assertEqual(self.one("SELECT count(*) FROM raw.ad_spend_daily WHERE currency = 'USD'")[0],
                         self.truth["planted"]["raw"]["Q-03-03"]["count"])

    def test_q03_04_meta_spend_for_14_and_15_july_2025_loaded_twice(self):
        dupes = self.rows("""SELECT r.spend_date, ch.channel_name, count(*) FROM (SELECT spend_date, campaign_id FROM raw.ad_spend_daily
                             GROUP BY ALL HAVING count(*) > 1) r JOIN raw.campaigns c USING (campaign_id) JOIN raw.channels ch USING (channel_id)
                             GROUP BY ALL ORDER BY 1""")
        self.assertEqual([(d, ch) for d, ch, _ in dupes], [(dt.date(2025, 7, 14), "meta"), (dt.date(2025, 7, 15), "meta")])
        meta_rows = self.one("""SELECT count(*) FROM clean.spend WHERE channel_name = 'meta'
                                AND spend_date IN (DATE '2025-07-14', DATE '2025-07-15')""")[0]
        self.assertEqual(sum(n for _, _, n in dupes), meta_rows, "every Meta row of those days is in raw twice")
        extra = self.one("SELECT (SELECT count(*) FROM raw.ad_spend_daily) - (SELECT count(*) FROM clean.ad_spend_daily)")[0]
        self.assertEqual(extra, meta_rows)
        self.assertEqual(extra, self.truth["planted"]["raw"]["Q-03-04"]["count"])

    def test_q03_05_about_3_percent_bot_sessions(self):
        bots, total, first_id = self.one("""WITH d AS (SELECT visitor_id, CAST(session_start AS DATE) AS day FROM raw.sessions
                                                       GROUP BY ALL HAVING count(*) >= 200)
            SELECT count(d.visitor_id), count(*), min(s.session_id) FILTER (WHERE d.visitor_id IS NOT NULL)
            FROM raw.sessions s LEFT JOIN d ON d.visitor_id = s.visitor_id AND d.day = CAST(s.session_start AS DATE)""")
        self.assertTrue(0.025 <= bots / total <= 0.035, f"{bots / total:.4f}")
        self.assertGreater(first_id, self.one("SELECT max(session_id) FROM clean.sessions")[0], "appended under new session_ids")
        busiest = self.one("SELECT max(n) FROM (SELECT count(*) AS n FROM clean.sessions GROUP BY visitor_id, CAST(session_start AS DATE))")[0]
        self.assertLess(busiest, 50, "clean has no bot")
        self.assertEqual(self.one("SELECT count(*) FROM raw.sessions")[0] - self.clean["sessions"].num_rows,
                         self.truth["planted"]["raw"]["Q-03-05"]["count"])
        kept = self.one("""SELECT count(*) FROM raw.sessions r JOIN clean.sessions c USING (session_id)
                           WHERE (r.visitor_id, r.session_start, nullif(r.utm_campaign, ''), r.landing_page, r.device, r.country_code)
                                 IS DISTINCT FROM (c.visitor_id, c.session_start, c.utm_campaign, c.landing_page, c.device, c.country_code)""")[0]
        self.assertEqual(kept, 0, "only the UTM fields of clean sessions change in raw (Q-03-01's spellings, Q-03-06's empty strings)")

    def test_q03_06_direct_sessions_missing_utm_fields_and_1_percent_empty_strings(self):
        empty = self.one("SELECT count(*) FROM raw.sessions WHERE utm_source = '' OR utm_medium = '' OR utm_campaign = ''")[0]
        share = empty / self.clean["sessions"].num_rows
        self.assertTrue(0.008 <= share <= 0.012, f"{share:.4f}")
        all_three = self.one("SELECT count(*) FROM raw.sessions WHERE utm_source = '' AND utm_medium = '' AND utm_campaign = ''")[0]
        self.assertEqual(all_three, empty)
        were_direct = self.one("""SELECT count(*) FROM raw.sessions r JOIN clean.session_channel c USING (session_id)
                                  WHERE r.utm_source = '' AND c.channel = 'direct'""")[0]
        self.assertEqual(were_direct, empty, "each empty string stands for a missing value of a direct session")
        self.assertEqual(self.one("SELECT count(*) FROM clean.sessions WHERE utm_source = '' OR utm_medium = '' OR utm_campaign = ''")[0], 0)
        # P32: the missing UTM fields of direct sessions are a business state, in both schemas.
        for schema in ("clean", "raw"):
            self.assertGreater(self.one(f"SELECT count(*) FROM {schema}.sessions WHERE utm_source IS NULL AND utm_medium IS NULL "
                                        f"AND utm_campaign IS NULL")[0], 100_000, schema)
        self.assertEqual(empty, self.truth["planted"]["raw"]["Q-03-06"]["count"])

    def test_q03_07_four_percent_of_payments_refunded_in_both_schemas(self):
        # P32 (E-155's precedent): a refund is a business state, not an error.
        share = float(self.one("SELECT avg(CASE WHEN refunded THEN 1 ELSE 0 END) FROM clean.payments")[0])
        self.assertTrue(0.035 <= share <= 0.045)
        self.assertTrue(self.raw["payments"].equals(self.clean["payments"]))
        self.assertEqual(self.one("SELECT count(*) FROM clean.payments WHERE refunded")[0],
                         self.truth["planted"]["raw"]["Q-03-07"]["count"])

    def test_the_truth_records_each_quirk(self):
        self.assertEqual(set(self.truth["planted"]["raw"]), {f"Q-03-0{i}" for i in range(1, 8)})
        self.assertTrue({"Q-03-01", "Q-03-02", "Q-03-03", "Q-03-04", "Q-03-05", "Q-03-06"} <= set(self.truth["findings"]["raw"]))

    def test_validate_rejects_raw_data_without_its_quirks(self):
        broken = {"clean": self.clean, "raw": {**self.raw, "ad_spend_daily": self.clean["ad_spend_daily"]}}
        with self.assertRaisesRegex(ValueError, "Q-03-02|FIND-03-11"):
            mv.validate(broken, self.truth)
        broken = {"clean": self.clean, "raw": {**self.raw, "sessions": self.clean["sessions"]}}
        with self.assertRaisesRegex(ValueError, "Q-03-01|FIND-03-12"):
            mv.validate(broken, self.truth)


class Budget(Fixture):
    def test_budget_rows_and_the_q3_2025_plants(self):
        months, channels = self.one("SELECT count(DISTINCT month), count(DISTINCT channel_id) FROM clean.budget_monthly")
        self.assertEqual((months, channels), (24, 7))
        first, last = self.one("SELECT min(month), max(month) FROM clean.budget_monthly")
        self.assertEqual((first, last), (dt.date(2024, 1, 1), dt.date(2025, 12, 1)))
        unpaid = self.one("""SELECT count(*) FROM clean.budget_monthly b JOIN clean.channels ch USING (channel_id)
                             WHERE ch.channel_group = 'unpaid'""")[0]
        self.assertEqual(unpaid, 0)
        ratios = {(ch, q): float(r) for ch, q, r in self.rows("""WITH a AS (SELECT channel_id, CAST(date_trunc('month', spend_date) AS DATE) AS month,
                                                                                   sum(spend) AS actual FROM clean.ad_spend_daily
                                                                                   JOIN clean.campaigns USING (campaign_id) GROUP BY ALL)
            SELECT ch.channel_name, strftime(b.month, '%Y') || '-Q' || quarter(b.month), sum(coalesce(a.actual, 0)) / sum(b.budget_eur)
            FROM clean.budget_monthly b JOIN clean.channels ch USING (channel_id) LEFT JOIN a USING (channel_id, month)
            GROUP BY ALL HAVING sum(b.budget_eur) > 0""")}
        self.assertGreaterEqual(ratios[("meta", "2025-Q3")], 1.15, "Meta overspends in Q3 2025")
        self.assertLessEqual(ratios[("linkedin", "2025-Q3")], 0.85, "LinkedIn underspends in Q3 2025")
        others = {k: v for k, v in ratios.items() if k not in {("meta", "2025-Q3"), ("linkedin", "2025-Q3")}}
        self.assertTrue(all(0.9 <= v <= 1.1 for v in others.values()), sorted(k for k, v in others.items() if not 0.9 <= v <= 1.1))
        plant = self.truth["planted"]["budget_monthly"]
        self.assertEqual((plant["overspend"]["channel"], plant["underspend"]["channel"]), ("meta", "linkedin"))


class Determinism(Fixture):
    def test_appended_tables_shift_no_other_table(self):
        # GEN-02: one stream per table in TABLE_ORDER. With budget_monthly replaced, every other table is the same (and the second
        # generation shows the seed gives the same data).
        empty = pa.table({n: pa.array([], t) for n, t in zip(self.clean["budget_monthly"].column_names,
                                                                 self.clean["budget_monthly"].schema.types)})
        with mock.patch.object(mv, "build_budget_monthly", return_value=empty):
            other, truth = mv.generate()
        for name, table in self.clean.items():
            if name != "budget_monthly":
                self.assertTrue(table.equals(other["clean"][name]), name)
        for name, table in self.raw.items():
            self.assertTrue(table.equals(other["raw"][name]), f"raw {name}")
        self.assertEqual(truth["planted"]["raw"], self.truth["planted"]["raw"])


class Notes(Fixture):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.db = duckdb.connect(config=NO_NETWORK)
        cls.db.execute("SET TimeZone = 'UTC'")
        cls.db.execute(DDL.read_text(encoding="utf-8").replace("{schema}", "mailvora"))
        for schema, source in (("mailvora", cls.clean), ("mailvora_raw", cls.raw)):
            for name, table in source.items():
                cls.db.register("src", table)
                cls.db.execute(f"INSERT INTO {schema}.{name} SELECT * FROM src")
                cls.db.unregister("src")
        cls.notes = mv_notes.schema_notes(cls.db, "mailvora")
        cls.raw_notes = mv_notes.raw_notes(cls.db, "mailvora_raw", mv_raw.RAW_TABLES)

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        super().tearDownClass()

    def test_clean_notes(self):
        by = {n["table"]: n for n in self.notes}
        self.assertEqual([n["table"] for n in self.notes], list(mv.CLEAN_TABLES))
        for table, n in by.items():
            self.assertEqual(n["schema"], "mailvora")
            self.assertTrue(n["grain"].startswith("one row per"), table)
            self.assertEqual(n["primary_key"], KEYS.get(table, []), table)
            self.assertEqual(n["row_count"], self.clean[table].num_rows, table)
            self.assertEqual(n["sample"]["columns"], [c for c, _ in COLUMNS[table]], table)
            self.assertEqual(len(n["sample"]["rows"]), min(5, n["row_count"]), table)
            self.assertEqual(n["from_level"], 4, f"{table}: Mailvora arrives with level 4")
            for f in n["foreign_keys"]:
                self.assertIn(f["ref_table"], COLUMNS, f"{table}: {f}")
                self.assertEqual(f["cardinality"], "1:N")
            text = json.dumps(n, ensure_ascii=False)
            self.assertNotIn("—", text, "no em dash")
            json.dumps(n)                          # the sample is JSON-safe: TIMESTAMPTZ values as text
        self.assertEqual(by["activation_events"]["primary_key"], [])
        self.assertEqual([f["ref_table"] for f in by["payments"]["foreign_keys"]], ["subscriptions"])
        self.assertEqual(by["sessions"]["column_notes"]["utm_campaign"], mv_notes.CHANNEL_RULE)
        self.assertIn("never sign up", by["sessions"]["column_notes"]["visitor_id"], "most visitor_ids have no row in signups")
        self.assertIn("UTC", by["signups"]["column_notes"]["signup_ts"])
        self.assertEqual(by["subscriptions"]["allowed_values"]["plan_name"], ["Business", "Lite", "Pro"])
        self.assertEqual(by["channels"]["allowed_values"]["channel_group"],
                         ["paid_partner", "paid_search", "paid_social", "paid_video", "unpaid"])
        self.assertEqual(by["ad_spend_daily"]["allowed_values"], {"currency": ["EUR"], "export_timezone": ["UTC"]})
        sample_ts = by["signups"]["sample"]["rows"][0][2]
        self.assertRegex(sample_ts, r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$")
        for n in self.notes:
            for text in n.get("column_notes", {}).values():
                self.assertNotIn("NULL", text)

    def test_raw_notes(self):
        by = {n["table"]: n for n in self.raw_notes}
        clean = {n["table"]: n for n in self.notes}
        self.assertEqual(set(by), RAW_TABLES)
        for table, n in by.items():
            self.assertTrue(n["grain"].startswith("This table may hold errors."), table)
            self.assertIn(clean[table]["grain"].lower(), n["grain"].lower(), table)
            self.assertEqual(n["primary_key"], clean[table]["primary_key"], table)
            self.assertEqual(n["from_level"], 4)
            self.assertEqual(n["row_count"], self.raw[table].num_rows, table)
            self.assertNotIn("—", json.dumps(n, ensure_ascii=False))
        # P33 (b): the day rule, in one sentence, with only columns a learner sees.
        rule = by["ad_spend_daily"]["column_notes"]["spend_date"]
        self.assertEqual(rule, mv_notes.LA_DAY_RULE)
        self.assertEqual(rule.count(". "), 0, "one sentence")
        for words in ("export_timezone", "America/Los_Angeles", "spend_date", "one day"):
            self.assertIn(words, rule)
        self.assertEqual(by["ad_spend_daily"]["allowed_values"]["currency"], ["EUR", "USD"])
        self.assertNotIn("utm_campaign", by["sessions"].get("column_notes", {}), "raw does not restate the clean rule")


# Ruling P40 (sprint 6 Part 2, Task H1 follow-up): the plants the marketing cases need on their hidden run, in the edge file.
EDGE_SQL = pathlib.Path(mv.__file__).resolve().parents[1] / "edge" / "mailvora_edge_case.sql"
EDGE = "mailvora_edge_case"
# The users with a payment in Q3 2025 that was not refunded, as the attribution case counts them.
PAYING_Q3 = f"""SELECT DISTINCT s.user_id FROM {EDGE}.payments p JOIN {EDGE}.subscriptions s USING (subscription_id)
                WHERE NOT p.refunded AND p.paid_at >= TIMESTAMPTZ '2025-07-01 00:00:00+00' AND p.paid_at < TIMESTAMPTZ '2025-10-01 00:00:00+00'"""


class EdgePlants(Fixture):
    """mailvora_edge_case built from its file over the generated tables, as the build does (the edge file copies mailvora's columns and
    its three reference tables); the other five plants are checked on the built database in test_build.py."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.db = duckdb.connect(config=NO_NETWORK)
        cls.db.execute("SET TimeZone = 'UTC'")
        cls.db.execute(DDL.read_text(encoding="utf-8").replace("{schema}", "mailvora"))
        for name in ("channels", "countries", "fx_rates_monthly"):      # the tables the edge file copies whole
            cls.db.register("src", cls.clean[name])
            cls.db.execute(f"INSERT INTO mailvora.{name} SELECT * FROM src")
            cls.db.unregister("src")
        cls.db.execute(EDGE_SQL.read_text(encoding="utf-8"))

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        super().tearDownClass()

    def count(self, sql):
        return self.db.execute(sql).fetchone()[0]

    def test_edge_a_q3_paying_user_with_no_session(self):
        found = self.count(f"""SELECT count(*) FROM ({PAYING_Q3}) pay JOIN {EDGE}.signups u USING (user_id)
                              WHERE NOT EXISTS (SELECT 1 FROM {EDGE}.sessions x WHERE x.visitor_id = u.visitor_id)""")
        self.assertGreater(found, 0, "a Q3 2025 paying user that attribution has no channel to credit for")

    def test_edge_a_q3_paying_user_whose_first_two_sessions_start_at_the_same_moment(self):
        found = self.count(f"""WITH t AS (SELECT u.user_id, x.session_start, x.utm_campaign, x.utm_medium,
                                                 min(x.session_start) OVER (PARTITION BY u.user_id) AS first
                                          FROM ({PAYING_Q3}) pay JOIN {EDGE}.signups u USING (user_id)
                                          JOIN {EDGE}.sessions x ON x.visitor_id = u.visitor_id AND x.session_start <= u.signup_ts)
                              SELECT count(*) FROM (SELECT user_id FROM t WHERE session_start = first GROUP BY 1
                                                    HAVING count(*) = 2 AND count(DISTINCT coalesce(utm_campaign, utm_medium, '')) = 2)""")
        self.assertGreater(found, 0, "a Q3 2025 payer whose first two sessions, from two channels, start at the same instant")

    def test_edge_a_september_signup_activated_after_day_7_that_pays_within_30_days(self):
        found = self.count(f"""SELECT count(*) FROM {EDGE}.signups u
            WHERE u.signup_ts >= TIMESTAMPTZ '2025-09-01 00:00:00+00' AND u.signup_ts < TIMESTAMPTZ '2025-10-01 00:00:00+00'
              AND EXISTS (SELECT 1 FROM {EDGE}.activation_events a WHERE a.user_id = u.user_id AND a.event_name = 'first_campaign_sent')
              AND NOT EXISTS (SELECT 1 FROM {EDGE}.activation_events a WHERE a.user_id = u.user_id
                              AND a.event_name = 'first_campaign_sent' AND a.event_ts <= u.signup_ts + INTERVAL 7 DAY)
              AND EXISTS (SELECT 1 FROM {EDGE}.subscriptions s JOIN {EDGE}.payments p USING (subscription_id)
                          WHERE s.user_id = u.user_id AND s.start_date <= CAST(u.signup_ts AS DATE) + 30
                            AND NOT p.refunded AND p.paid_at <= u.signup_ts + INTERVAL 30 DAY)""")
        self.assertGreater(found, 0, "a September 2025 signup that activates after its first 7 days but pays within 30 days")


if __name__ == "__main__":
    unittest.main()

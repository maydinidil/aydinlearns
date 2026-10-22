"""Sprint 7 Part 2, Task G1 (S7-15): mailvora_edge_clean, the edge schema of the take-home on raw Mailvora data (TAKE-HOME-B,
CASE-TAKE-B on mailvora_raw). It is to mailvora_raw what voltmarkt_edge_clean is to voltmarkt_raw (S6-04).

- It has mailvora_raw's table names and columns and no view, and the build lists it among the edge schemas that mirror a raw
  schema.
- It holds a case of each of Q-03-01 to Q-03-07 (knowledge/05 CO-03) that mailvora_raw does not show: another value, another
  place or another shape of the same quirk. Each quirk's test measures that on both schemas, then runs a query fitted to what
  mailvora_raw shows beside the rule mailvora_raw's notes give: the two agree on mailvora_raw and disagree here, so a take-home
  query fitted to the visible quirks fails its hidden run.
- Every table and view of manifest_before_sprint7b.json keeps its rows and hash (R37): G1 only adds this schema.
- Once cleaned by those rules, its rows follow Mailvora's rules, and its description lists each plant under its tables.

Assertions name schemas, tables, IDs and counts only.
"""
import datetime as dt
import json
import pathlib
import shutil
import tempfile
import unittest

import duckdb

from course_build import build_course_db   # L50: the paths, and Mailvora generated once per process (S7-30)
from mailvora import generate as mv

NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17
ROOT = pathlib.Path(build_course_db.ROOT)
EDGE = "mailvora_edge_clean"
RAW = build_course_db.MAILVORA_RAW_SCHEMA
LA = mv.PLANTS["linkedin_export"]["timezone"]
REIMPORT = ", ".join(f"DATE '{d}'" for d in mv.PLANTS["meta_reimport"])       # Q-03-04's two dates
META_SPELLINGS = ("facebook", "fb", "meta", "ig")      # FIND-03-12's mapped spellings, after lower(trim())
PLAN_PRICES = sorted(price for _, price in mv.PLANS)
BEFORE_SPRINT7B = json.loads((pathlib.Path(__file__).resolve().parent / "manifest_before_sprint7b.json").read_text(encoding="utf-8"))["tables"]

# The rules mailvora_raw's notes give, in SQL. Q-03-04: a row loaded again is the same row; P33 (LA_DAY_RULE): a row whose
# export_timezone is America/Los_Angeles is spend_date plus one day in UTC; Q-03-03: spend is in the row's currency, at the rate of
# its UTC day's month (FIND-03-13).
UTC_DAY = f"CASE WHEN export_timezone = '{LA}' THEN spend_date + 1 ELSE spend_date END"
CLEAN_SPEND = """SELECT a.campaign_id, a.utc_day, a.impressions, a.clicks,
       CASE WHEN a.currency = 'EUR' THEN a.spend ELSE a.spend * fx.eur_per_unit END AS spend_eur
FROM (SELECT DISTINCT *, {utc_day} AS utc_day FROM {s}.ad_spend_daily) a
LEFT JOIN {s}.fx_rates_monthly fx ON fx.currency = a.currency AND fx.month = date_trunc('month', a.utc_day)"""
# E-196's channel rule (notes.CHANNEL_RULE), each UTM field read through the expression given for it (source, medium, campaign).
# Q-03-06's rule reads an empty string as missing, field by field (EACH_EMPTY).
CHANNEL = """SELECT x.session_id,
       CASE WHEN x.campaign IS NOT NULL THEN ch.channel_name
            WHEN x.medium = 'organic' THEN 'organic'
            WHEN x.medium = 'referral' THEN 'referral'
            WHEN x.source IS NULL AND x.medium IS NULL THEN 'direct' END AS channel
FROM (SELECT session_id, {source} AS source, {medium} AS medium, {campaign} AS campaign FROM {s}.sessions) x
LEFT JOIN {s}.campaigns c ON c.utm_campaign = x.campaign LEFT JOIN {s}.channels ch ON ch.channel_id = c.channel_id"""
EACH_EMPTY = {"source": "nullif(utm_source, '')", "medium": "nullif(utm_medium, '')", "campaign": "nullif(utm_campaign, '')"}
# Q-03-05: a bot is a visitor_id with 200 or more sessions on a UTC day.
BOT_DAYS = "SELECT visitor_id, CAST(session_start AS DATE) AS day FROM {s}.sessions {where} GROUP BY ALL HAVING count(*) {cut}"
BOT_SESSIONS = """SELECT x.session_id FROM {s}.sessions x JOIN ({days}) b
                  ON b.visitor_id = x.visitor_id AND b.day = CAST(x.session_start AS DATE)"""


def channel_of(s, **fields):
    return CHANNEL.format(s=s, **{**EACH_EMPTY, **fields})


def by_channel(s, name):
    return f"SELECT x.session_id FROM {s}.sessions x JOIN {s}.campaigns c USING (utm_campaign) JOIN {s}.channels ch USING (channel_id) WHERE ch.channel_name = '{name}'"


class MailvoraEdgeClean(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = pathlib.Path(tempfile.mkdtemp())
        cls.manifest = build_course_db.build(cls.dir / "course.duckdb", data_dir=cls.dir)
        cls.con = duckdb.connect(str(cls.dir / "course.duckdb"), read_only=True, config=NO_NETWORK)
        cls.con.execute("SET TimeZone = 'UTC'")

    @classmethod
    def tearDownClass(cls):
        cls.con.close()
        shutil.rmtree(cls.dir, ignore_errors=True)

    def one(self, sql, params=None):
        return self.con.execute(sql, params or []).fetchone()

    def col(self, sql, params=None):
        return [r[0] for r in self.con.execute(sql, params or []).fetchall()]

    def names(self, schema):
        tables = set(self.col("SELECT table_name FROM duckdb_tables() WHERE schema_name = ? AND NOT internal", [schema]))
        views = set(self.col("SELECT view_name FROM duckdb_views() WHERE schema_name = ? AND NOT internal", [schema]))
        return tables, views

    def columns(self, schema, table):
        return self.con.execute("SELECT column_name, data_type FROM information_schema.columns "
                                "WHERE table_schema = ? AND table_name = ? ORDER BY ordinal_position", [schema, table]).fetchall()

    def differ(self, a, b):
        """(rows of a not in b, rows of b not in a), counted with EXCEPT ALL."""
        return self.one(f"SELECT (SELECT count(*) FROM (({a}) EXCEPT ALL ({b}))), (SELECT count(*) FROM (({b}) EXCEPT ALL ({a})))")

    def fitted_and_rule(self, fitted, rule, edge_counts, what):
        """The fitted query gives the rule's rows on mailvora_raw, and not here: `edge_counts` rows apart, each way."""
        self.assertEqual(self.differ(fitted.format(s=RAW), rule.format(s=RAW)), (0, 0), f"{what}: on mailvora_raw the fitted query is right")
        self.assertEqual(self.differ(fitted.format(s=EDGE), rule.format(s=EDGE)), edge_counts, f"{what}: on {EDGE} it is not")

    # ---- the schema, its registration and the lock on everything else --------------------------------------------------------

    def test_the_schema_has_mailvora_raws_table_names_and_columns(self):
        tables, views = self.names(EDGE)
        self.assertEqual((tables, views), self.names(RAW), f"{EDGE} has {RAW}'s table names")
        self.assertEqual(views, set(), "and no view")
        for t in sorted(tables):
            with self.subTest(table=t):
                self.assertEqual(self.columns(EDGE, t), self.columns(RAW, t), f"{EDGE}.{t} mirrors {RAW}.{t}")
                self.assertGreaterEqual(self.one(f"SELECT count(*) FROM {EDGE}.{t}")[0], 1, f"{EDGE}.{t} has rows")
        self.assertIn(EDGE, build_course_db.RAW_EDGE_SCHEMAS, "the build lists it among the edge schemas that mirror a raw schema")
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        self.assertFalse([n for n in notes if n["schema"] == EDGE], "an edge schema has no table notes")
        checkpoints = json.loads((self.dir / "truth" / "checkpoints.json").read_text(encoding="utf-8"))
        self.assertIn(EDGE, checkpoints["schemas"], "the schemas built, which say what a case can run on (S6-13)")

    def test_every_object_before_part_2_is_unchanged_and_g1_only_adds_the_schema(self):
        self.assertEqual(len(BEFORE_SPRINT7B), 246)
        moved = sorted(name for name, entry in BEFORE_SPRINT7B.items() if self.manifest["tables"].get(name) != entry)
        self.assertEqual(moved, [], "objects built at the end of Part 1 whose rows or hash changed")
        added = sorted(set(self.manifest["tables"]) - set(BEFORE_SPRINT7B))
        self.assertEqual(added, sorted(f"{EDGE}.{t}" for t in self.names(RAW)[0]), f"only {EDGE}'s tables are new")
        self.assertEqual(len(added), 7)

    # ---- Q-03-01 to Q-03-07, one test each: a case mailvora_raw does not show, which a query fitted to mailvora_raw fails ----

    def test_q_03_01_spellings_mailvora_raw_lacks_and_spellings_outside_meta(self):
        spellings = "SELECT DISTINCT x.{col} FROM ({ids}) i JOIN {s}.sessions x USING (session_id) ORDER BY 1"
        meta = {s: set(self.col(spellings.format(col="utm_source", ids=by_channel(s, "meta"), s=s))) for s in (RAW, EDGE)}
        mediums = {s: set(self.col(spellings.format(col="utm_medium", ids=by_channel(s, "meta"), s=s))) for s in (RAW, EDGE)}
        self.assertEqual(meta[EDGE] - meta[RAW], {"instagram"}, "a Meta utm_source spelling mailvora_raw lacks")
        self.assertEqual(mediums[EDGE] - mediums[RAW], {"paid-social"}, "a Meta utm_medium spelling mailvora_raw lacks")
        self.assertTrue({"fb", "ig", "Paid-Social", "cpc"} <= meta[EDGE] | mediums[EDGE], "beside the spellings mailvora_raw shows")
        linkedin = {s: set(self.col(spellings.format(col="utm_source", ids=by_channel(s, "linkedin"), s=s))) for s in (RAW, EDGE)}
        self.assertEqual(linkedin[RAW], {"linkedin"}, "on mailvora_raw only Meta's spellings vary")
        self.assertEqual(linkedin[EDGE], {"linkedin", "LinkedIn", "linkedin.com"}, "here LinkedIn's do too")
        spelled = ", ".join(f"'{x}'" for x in META_SPELLINGS)
        self.fitted_and_rule(f"SELECT session_id FROM {{s}}.sessions WHERE lower(trim(utm_source)) IN ({spelled})", by_channel("{s}", "meta"),
                             (0, 1), "Meta sessions by FIND-03-12's spellings against Meta sessions by their campaign")
        self.fitted_and_rule("SELECT session_id FROM {s}.sessions WHERE lower(trim(utm_source)) = 'linkedin'", by_channel("{s}", "linkedin"),
                             (0, 1), "LinkedIn sessions by their spelling against LinkedIn sessions by their campaign")

    def test_q_03_02_los_angeles_days_outside_linkedin_and_a_linkedin_row_in_utc(self):
        zones = """SELECT DISTINCT ch.channel_name FROM {s}.ad_spend_daily a JOIN {s}.campaigns c USING (campaign_id)
                   JOIN {s}.channels ch USING (channel_id) WHERE a.export_timezone = ? ORDER BY 1"""
        self.assertEqual(self.col(zones.format(s=RAW), [LA]), ["linkedin"], "on mailvora_raw only LinkedIn exports Los Angeles days")
        self.assertEqual(self.col(zones.format(s=EDGE), [LA]), ["linkedin", "review_sites"], "here Capterra does too")
        self.assertNotIn("linkedin", self.col(zones.format(s=RAW), ["UTC"]), "on mailvora_raw no LinkedIn row is in UTC")
        self.assertIn("linkedin", self.col(zones.format(s=EDGE), ["UTC"]), "here one is")
        fitted = """SELECT a.campaign_id, CASE WHEN ch.channel_name = 'linkedin' THEN a.spend_date + 1 ELSE a.spend_date END
                    FROM (SELECT DISTINCT * FROM {s}.ad_spend_daily) a JOIN {s}.campaigns c USING (campaign_id) JOIN {s}.channels ch USING (channel_id)"""
        rule = f"SELECT campaign_id, {UTC_DAY} FROM (SELECT DISTINCT * FROM {{s}}.ad_spend_daily)"
        self.fitted_and_rule(fitted, rule, (3, 3), "each row's UTC day, shifted by channel against shifted by export_timezone")
        # The sessions of a campaign that exports Los Angeles days fall on the UTC day of its rows, never on the date they carry.
        sessions = f"""SELECT count(*) FILTER (WHERE a.spend_date + 1 = CAST(x.session_start AS DATE)),
                              count(*) FILTER (WHERE a.spend_date = CAST(x.session_start AS DATE))
                       FROM {EDGE}.sessions x JOIN {EDGE}.campaigns c USING (utm_campaign)
                       JOIN {EDGE}.ad_spend_daily a ON a.campaign_id = c.campaign_id WHERE a.export_timezone = '{LA}'"""
        self.assertEqual(self.one(sessions), (3, 0), "two LinkedIn sessions and a Capterra one, each on the day after its row's date")

    def test_q_03_03_currencies_mailvora_raw_lacks_and_currencies_outside_linkedin(self):
        currencies = "SELECT DISTINCT currency FROM {s}.ad_spend_daily ORDER BY 1"
        self.assertEqual(self.col(currencies.format(s=RAW)), ["EUR", "USD"])
        self.assertEqual(self.col(currencies.format(s=EDGE)), ["EUR", "GBP", "USD"], "a currency mailvora_raw lacks")
        rates = "SELECT DISTINCT currency FROM {s}.fx_rates_monthly ORDER BY 1"
        self.assertEqual(self.col(rates.format(s=EDGE)), ["GBP", "USD"], "with its rates")
        dollars = """SELECT DISTINCT ch.channel_name FROM {s}.ad_spend_daily a JOIN {s}.campaigns c USING (campaign_id)
                     JOIN {s}.channels ch USING (channel_id) WHERE a.currency = ? ORDER BY 1"""
        self.assertEqual(self.col(dollars.format(s=RAW), ["USD"]), ["linkedin"], "on mailvora_raw only LinkedIn bills in dollars")
        self.assertEqual(self.col(dollars.format(s=EDGE), ["USD"]), ["linkedin", "review_sites"], "here G2 does too")
        self.assertNotIn("linkedin", self.col(dollars.format(s=RAW), ["EUR"]))
        self.assertIn("linkedin", self.col(dollars.format(s=EDGE), ["EUR"]), "and a LinkedIn row is in euros")
        rule = f"SELECT campaign_id, utc_day, round(spend_eur, 6) FROM ({CLEAN_SPEND.format(s='{s}', utc_day=UTC_DAY)})"
        usd = "(SELECT eur_per_unit FROM {s}.fx_rates_monthly f WHERE f.currency = 'USD' AND f.month = date_trunc('month', a.utc_day))"
        by_channel_rate = f"""SELECT a.campaign_id, a.utc_day, round(CASE WHEN ch.channel_name = 'linkedin' THEN a.spend * {usd} ELSE a.spend END, 6)
            FROM (SELECT DISTINCT *, {UTC_DAY} AS utc_day FROM {{s}}.ad_spend_daily) a JOIN {{s}}.campaigns c USING (campaign_id)
            JOIN {{s}}.channels ch USING (channel_id)"""
        dollar_rate = f"""SELECT a.campaign_id, a.utc_day, round(CASE WHEN a.currency = 'USD' THEN a.spend * {usd} ELSE a.spend END, 6)
            FROM (SELECT DISTINCT *, {UTC_DAY} AS utc_day FROM {{s}}.ad_spend_daily) a"""
        self.fitted_and_rule(by_channel_rate, rule, (4, 4), "LinkedIn's rows at the dollar rate against each row at its currency's rate")
        self.fitted_and_rule(dollar_rate, rule, (1, 1), "dollar rows at the dollar rate against each row at its currency's rate")
        # The LinkedIn row dated 31 July is 1 August in UTC, so it takes August's rate, which is not July's.
        campaign, spend, currency, day = self.one(f"""SELECT a.campaign_id, a.spend, a.currency, {UTC_DAY} FROM {EDGE}.ad_spend_daily a
            JOIN {EDGE}.campaigns c USING (campaign_id) JOIN {EDGE}.channels ch USING (channel_id)
            WHERE ch.channel_name = 'linkedin' AND a.spend_date = DATE '2025-07-31'""")
        self.assertEqual((currency, day), ("USD", dt.date(2025, 8, 1)))
        eur = self.one(f"SELECT spend_eur FROM ({CLEAN_SPEND.format(s=EDGE, utc_day=UTC_DAY)}) WHERE campaign_id = ? AND utc_day = ?", [campaign, day])[0]
        july, august = self.col(f"SELECT eur_per_unit FROM {EDGE}.fx_rates_monthly WHERE currency = 'USD' AND month IN (DATE '2025-07-01', DATE '2025-08-01') ORDER BY month")
        self.assertEqual(eur, spend * august, "converted at August's rate")
        self.assertNotEqual(july, august, "so the month of its date would give another number")

    def test_q_03_04_a_re_import_in_another_channel_on_another_day_loaded_three_times(self):
        again = """SELECT ch.channel_name, a.spend_date, count(*) AS n FROM {s}.ad_spend_daily a JOIN {s}.campaigns c USING (campaign_id)
                   JOIN {s}.channels ch USING (channel_id) GROUP BY ch.channel_name, a.spend_date, a.campaign_id HAVING count(*) > 1"""
        raw = self.con.execute(f"SELECT list(DISTINCT channel_name), list(DISTINCT spend_date ORDER BY spend_date), max(n) FROM ({again.format(s=RAW)})").fetchone()
        edge = self.con.execute(f"SELECT list(DISTINCT channel_name ORDER BY channel_name), list(DISTINCT spend_date ORDER BY spend_date), max(n) FROM ({again.format(s=EDGE)})").fetchone()
        self.assertEqual((raw[0], [str(d) for d in raw[1]], raw[2]), (["meta"], mv.PLANTS["meta_reimport"], 2),
                         "on mailvora_raw Meta's two days, each loaded twice")
        self.assertEqual((edge[0], [str(d) for d in edge[1]], edge[2]), (["meta", "nonbrand_search"], [*mv.PLANTS["meta_reimport"], "2025-08-05"], 3),
                         "here nonbrand search too, on another day, loaded three times")
        fitted = f"""SELECT * FROM {{s}}.ad_spend_daily a WHERE NOT (a.spend_date IN ({REIMPORT}) AND a.campaign_id IN (
                         SELECT campaign_id FROM {{s}}.campaigns JOIN {{s}}.channels USING (channel_id) WHERE channel_name = 'meta'))
                     UNION ALL
                     SELECT DISTINCT * FROM {{s}}.ad_spend_daily a WHERE a.spend_date IN ({REIMPORT}) AND a.campaign_id IN (
                         SELECT campaign_id FROM {{s}}.campaigns JOIN {{s}}.channels USING (channel_id) WHERE channel_name = 'meta')"""
        self.fitted_and_rule(fitted, "SELECT DISTINCT * FROM {s}.ad_spend_daily", (2, 0), "Meta's two days loaded once against every row loaded once")

    def test_q_03_05_a_bot_of_exactly_200_sessions_and_a_bot_with_utm_fields(self):
        days = "SELECT CAST(session_start AS DATE) AS day, count(*) AS n, count(utm_source) AS tagged FROM {s}.sessions GROUP BY visitor_id, day HAVING count(*) >= 200"
        raw = self.one(f"SELECT min(n), max(tagged) FROM ({days.format(s=RAW)})")
        self.assertGreater(raw[0], 200, "on mailvora_raw every bot day has more than 200 sessions")
        self.assertEqual(raw[1], 0, "and no bot session has UTM fields")
        edge = self.con.execute(f"SELECT n, tagged FROM ({days.format(s=EDGE)}) ORDER BY n").fetchall()
        self.assertEqual(edge, [(200, 200), (230, 0)], "here a bot with exactly 200 sessions in a day, each tagged, beside one like raw's")
        rule = BOT_SESSIONS.format(s="{s}", days=BOT_DAYS.format(s="{s}", where="", cut=">= 200"))
        above = BOT_SESSIONS.format(s="{s}", days=BOT_DAYS.format(s="{s}", where="", cut="> 200"))
        untagged = BOT_SESSIONS.format(s="{s}", days=BOT_DAYS.format(
            s="{s}", where="WHERE utm_source IS NULL AND utm_medium IS NULL AND utm_campaign IS NULL", cut=">= 200"))
        self.fitted_and_rule(above, rule, (0, 200), "more than 200 sessions a day against 200 or more")
        self.fitted_and_rule(untagged, rule, (0, 200), "bots among untagged sessions against bots among all sessions")

    def test_q_03_06_empty_strings_in_one_field_only(self):
        some = """SELECT count(*) FROM {s}.sessions WHERE (utm_source = '' OR utm_medium = '' OR utm_campaign = '')
                  AND NOT coalesce(utm_source = '' AND utm_medium = '' AND utm_campaign = '', false)"""
        self.assertEqual(self.one(some.format(s=RAW))[0], 0, "on mailvora_raw an empty string is always in all three fields")
        self.assertEqual(self.one(some.format(s=EDGE))[0], 2, "here one field is empty and the others are not")
        whole = "CASE WHEN utm_source = '' AND utm_medium = '' AND utm_campaign = '' THEN NULL ELSE {f} END"
        fitted = channel_of("{s}", source=whole.format(f="utm_source"), medium=whole.format(f="utm_medium"), campaign=whole.format(f="utm_campaign"))
        pick = "SELECT session_id, channel FROM ({q})"
        self.fitted_and_rule(pick.format(q=fitted), pick.format(q=channel_of("{s}")), (2, 2),
                             "each session's channel, empty strings read as missing all three together against field by field")
        channels = dict(self.con.execute(f"""SELECT session_id, channel FROM ({channel_of(EDGE)}) WHERE session_id IN (
                                             SELECT session_id FROM {EDGE}.sessions WHERE utm_source = '' OR utm_campaign = '')""").fetchall())
        self.assertEqual(sorted(channels.values()), ["direct", "direct", "organic"], "the rule maps each one")
        self.assertEqual(self.one(f"SELECT count(*) FROM ({channel_of(EDGE)}) WHERE channel IS NULL")[0], 0, "and every session")

    def test_q_03_07_a_refunded_share_far_from_4_percent(self):
        refunds = "SELECT avg(CASE WHEN refunded THEN 1 ELSE 0 END), sum(amount_eur) FILTER (WHERE refunded) / sum(amount_eur) FROM {s}.payments"
        raw_count, _ = (float(x) for x in self.one(refunds.format(s=RAW)))
        edge_count, edge_money = (float(x) for x in self.one(refunds.format(s=EDGE)))
        self.assertLess(abs(raw_count - mv.REFUND_SHARE), 0.006, "on mailvora_raw about 4% of payments are refunded")
        self.assertGreater(edge_count, 0.2, "here a quarter of them")
        self.assertGreater(edge_money - edge_count, 0.1, "and a larger share of the money: a 120 euro payment is refunded")
        # A revenue fitted to mailvora_raw's 4% is near the right one there, and far from it here.
        error = "SELECT abs((1 - ?) * sum(amount_eur) - sum(amount_eur) FILTER (WHERE NOT refunded)) / sum(amount_eur) FILTER (WHERE NOT refunded) FROM {s}.payments"
        self.assertLess(float(self.one(error.format(s=RAW), [mv.REFUND_SHARE])[0]), 0.01, "on mailvora_raw, 4% off the total is close")
        self.assertGreater(float(self.one(error.format(s=EDGE), [mv.REFUND_SHARE])[0]), 0.25, "here it is not")
        august = self.one(f"""SELECT sum(amount_eur) FILTER (WHERE refunded) / sum(amount_eur) FROM {EDGE}.payments
                              WHERE paid_at >= TIMESTAMPTZ '2025-08-01 00:00:00+00' AND paid_at < TIMESTAMPTZ '2025-09-01 00:00:00+00'""")[0]
        self.assertGreater(float(august), 0.5, "in August 2025 most of the money paid was refunded")

    # ---- once cleaned by those rules, the rows follow Mailvora's rules -------------------------------------------------------

    def test_cleaned_rows_follow_mailvoras_rules(self):
        spend = CLEAN_SPEND.format(s=EDGE, utc_day=UTC_DAY)
        channels = channel_of(EDGE)
        checks = {
            "a spend row with no rate for its currency and UTC month": f"SELECT count(*) FROM ({spend}) WHERE spend_eur IS NULL",
            "two spend rows of one campaign on one UTC day": f"SELECT count(*) - count(DISTINCT (campaign_id, utc_day)) FROM ({spend})",
            "a UTC spend day outside its campaign's dates": f"""SELECT count(*) FROM ({spend}) a JOIN {EDGE}.campaigns c USING (campaign_id)
                WHERE a.utc_day < c.start_date OR a.utc_day > c.end_date""",
            "more clicks than impressions, or a negative count or spend": f"""SELECT count(*) FROM ({spend})
                WHERE clicks > impressions OR clicks < 0 OR impressions < 0 OR spend_eur < 0""",
            "an export time zone or a currency the rules do not cover": f"""SELECT count(*) FROM {EDGE}.ad_spend_daily
                WHERE export_timezone NOT IN ('UTC', '{LA}') OR (currency <> 'EUR' AND currency NOT IN (SELECT currency FROM {EDGE}.fx_rates_monthly))""",
            "a campaign session on a UTC day its campaign had no clicks": f"""SELECT count(*) FROM {EDGE}.sessions x
                JOIN {EDGE}.campaigns c ON c.utm_campaign = nullif(x.utm_campaign, '')
                WHERE NOT EXISTS (SELECT 1 FROM ({spend}) a WHERE a.campaign_id = c.campaign_id AND a.utc_day = CAST(x.session_start AS DATE) AND a.clicks > 0)""",
            "a session with a campaign name no campaign has": f"""SELECT count(*) FROM {EDGE}.sessions WHERE nullif(utm_campaign, '') IS NOT NULL
                AND utm_campaign NOT IN (SELECT utm_campaign FROM {EDGE}.campaigns)""",
            "a session the channel rule maps to no channel": f"SELECT count(*) FROM ({channels}) WHERE channel IS NULL",
            "a signup with no session before it": f"""SELECT count(*) FROM {EDGE}.signups u WHERE NOT EXISTS (SELECT 1 FROM {EDGE}.sessions x
                WHERE x.visitor_id = u.visitor_id AND x.session_start <= u.signup_ts)""",
            "a signup of a bot": f"""SELECT count(*) FROM {EDGE}.signups WHERE visitor_id IN (SELECT visitor_id FROM ({BOT_DAYS.format(s=EDGE, where='', cut='>= 200')}))""",
            "a session or signup country mailvora's countries lack": f"""SELECT count(*) FROM (SELECT country_code FROM {EDGE}.sessions UNION ALL
                SELECT country_code FROM {EDGE}.signups) WHERE country_code NOT IN (SELECT country_code FROM mailvora.countries)""",
            "a payment of no plan's price": f"SELECT count(*) FROM {EDGE}.payments WHERE amount_eur NOT IN ({', '.join(map(str, PLAN_PRICES))})",
        }
        for what, sql in checks.items():
            with self.subTest(check=what):
                self.assertEqual(self.one(sql)[0], 0, what)
        for table, where in (("channels", ""), ("campaigns", ""), ("fx_rates_monthly", "WHERE currency = 'USD'")):
            with self.subTest(copy=table):
                foreign = self.one(f"SELECT count(*) FROM (SELECT * FROM {EDGE}.{table} {where} EXCEPT ALL SELECT * FROM {RAW}.{table})")[0]
                self.assertEqual(foreign, 0, f"{table} {where}: each row is mailvora_raw's")
        self.assertEqual(self.one(f"SELECT count(*) FROM {EDGE}.channels")[0], self.one(f"SELECT count(*) FROM {RAW}.channels")[0], "every channel")

    # ---- the description ---------------------------------------------------------------------------------------------------------

    def test_the_description_lists_each_plant_under_its_tables(self):
        desc = json.loads((ROOT / "content" / "sql" / "edge" / f"{EDGE}.json").read_text(encoding="utf-8"))
        tables, _ = self.names(EDGE)
        self.assertEqual((desc["schema"], desc["mirrors"], desc["family"]), (EDGE, RAW, "clean"))
        self.assertGreaterEqual(len(desc["contains"]), 7, "a line for each of Q-03-01 to Q-03-07 at least")
        self.assertEqual(len(set(desc["contains"])), len(desc["contains"]), "no line twice")
        self.assertTrue(desc["tables"] and set(desc["tables"]) <= tables, sorted(set(desc["tables"]) - tables))
        listed = [line for lines in desc["tables"].values() for line in lines]
        self.assertEqual(set(listed) - set(desc["contains"]), set(), "every table line is a contains line")
        self.assertEqual(set(desc["contains"]) - set(listed), set(), "every contains line sits under a table")
        for table, lines in desc["tables"].items():
            self.assertEqual(lines, [x for x in desc["contains"] if x in lines], f"{table}: lines once each, in their order")
        for table in ("sessions", "ad_spend_daily", "fx_rates_monthly", "signups", "payments"):
            self.assertIn(table, desc["tables"], f"{table} holds a plant")
        text = json.dumps(desc, ensure_ascii=False)
        self.assertNotIn("—", text, "no em dash")
        self.assertNotIn("NULL", text, "missing, not NULL")
        self.assertNotRegex(text, r"(?i)\b(he|she|him|her|his|hers)\b", "no gendered pronoun")


if __name__ == "__main__":
    unittest.main()

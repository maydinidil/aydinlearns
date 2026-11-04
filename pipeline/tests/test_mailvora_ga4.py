"""Sprint 9, Task L1 (S9-02, S9-03; E-131 decided by E-218; S9-C11, S9-C16 to S9-C18): mailvora_ga4, a sample of Mailvora's website
as GA4's BigQuery export writes it, and mailvora_edge_ga4, its edge schema.

- mailvora_ga4.events has S9-02's column types exactly. It is derived from mailvora's own rows on the property's days (Europe/Dublin,
  1 October to 31 December 2025, S9-C11): a session_start and one or more page_view per session, first_visit on a visitor's first
  session, sign_up at each signup, purchase at each subscription's first payment. Its session_start, sign_up and purchase events
  equal mailvora's sessions, signups and first payments on those days (SQL-CRAFT-01 relies on it).
- Every session has one ga_session_id (its start in seconds since 1970) and its events share it, each within 30 minutes of the one
  before (S9-C17). Every purchase comes from the billing server with no session, and so does a sign_up that fits no session; the
  distinct user_pseudo_id and ga_session_id pairs are the session_start events that carry them. The plants hold: value in
  int_value for the stated share of purchases, two visitors sharing a ga_session_id, about 2% of events with no user_pseudo_id and
  no ga_session_id (consent denied), event_date the next Dublin day for events after 23:00 UTC before 2025-10-26 and none after.
- The row cap (S9-C16: 1,000,000) holds, and a second generation gives the same hash. Every object of manifest_before_sprint9.json
  keeps its rows and hash: sprint 9 only adds the two schemas. mailvora_ga4 also holds views onto the four mailvora tables a level 7
  item joins, so a graded query, which names no schema, can join them to events (S9-C18).
- The notes are Mailvora's shape, from level 7, with a JSON-safe sample row, and name only tables of this schema (S9-C28: L1-R1,
  L1-R2); they say what engagement_time_msec and session_engaged mean and how many purchases have a refunded first payment (L1-R3).
- The edge schema mirrors events and the four mailvora tables a level 7 item joins, holds each of S9-03's plants, S9-C29's
  refunded first payment and S9-C42's sign_up dated 1 October in Dublin and 30 September in UTC (review F2-1-1), follows the
  sample's page timing (L1-R4), and its description lists them.
- Every duckdb.connect passes R17's settings.

Assertions name schemas, tables, event names, counts and shares only.
"""
import json
import pathlib
import re
import shutil
import tempfile
import unittest
from unittest import mock

import duckdb

from course_build import build_course_db   # L50: the paths, and Mailvora generated once per process
from mailvora import ga4
from mailvora import generate as mv

NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17
ROOT = pathlib.Path(build_course_db.ROOT)
PIPELINE = ROOT / "pipeline"
GA4 = "mailvora_ga4"
EDGE = "mailvora_edge_ga4"
MV = "mailvora"
BEFORE_SPRINT9 = json.loads((pathlib.Path(__file__).resolve().parent / "manifest_before_sprint9.json").read_text(encoding="utf-8"))["tables"]
# S9-02: the export's shape (07 §5.2) cut to what level 7 uses, as DuckDB writes each type.
EVENT_COLUMNS = [
    ("event_date", "VARCHAR"),
    ("event_timestamp", "BIGINT"),
    ("event_name", "VARCHAR"),
    ("event_params", 'STRUCT("key" VARCHAR, "value" STRUCT(string_value VARCHAR, int_value BIGINT, float_value DOUBLE, double_value DOUBLE))[]'),
    ("user_id", "VARCHAR"),
    ("user_pseudo_id", "VARCHAR"),
    ("traffic_source", 'STRUCT("name" VARCHAR, medium VARCHAR, "source" VARCHAR)'),
    ("device", "STRUCT(category VARCHAR)"),
    ("geo", "STRUCT(country VARCHAR)"),
    ("ecommerce", "STRUCT(transaction_id VARCHAR, purchase_revenue DOUBLE)"),
]
EVENT_NAMES = ["first_visit", "page_view", "purchase", "session_start", "sign_up"]
VIEWS = ["sessions", "signups", "subscriptions", "payments"]   # S9-C18: views onto mailvora's tables, in this order
EDGE_MIRRORS = {"events": GA4, "sessions": MV, "signups": MV, "subscriptions": MV, "payments": MV}
# One parameter's value, read from the slot S9-02 gives it (a missing key reads as missing).
INT = "list_filter(event_params, lambda p: p.key = '{k}')[1].value.int_value"
STR = "list_filter(event_params, lambda p: p.key = '{k}')[1].value.string_value"
DBL = "list_filter(event_params, lambda p: p.key = '{k}')[1].value.double_value"
HAS = "len(list_filter(event_params, lambda p: p.key = '{k}'))"
SID = INT.format(k="ga_session_id")
WEBSITE = HAS.format(k="page_location") + " = 1"   # an event of the website's tag (the server's have no page_location, S9-C17)
THIRTY_MINUTES_US = 30 * 60 * 1_000_000
# Each event that carries a ga_session_id, with the gap to the event before it in its session (user_pseudo_id with ga_session_id).
GAPS = """SELECT event_timestamp - lag(event_timestamp) OVER (PARTITION BY user_pseudo_id, s ORDER BY event_timestamp) AS gap
          FROM (SELECT user_pseudo_id, {sid} AS s, event_timestamp FROM {{schema}}.events WHERE {sid} IS NOT NULL)""".format(sid=SID)
# The property's day of a TIMESTAMPTZ, and S9-C11's window of those days.
DUBLIN_DAY = "CAST(timezone('Europe/Dublin', {c}) AS DATE)"
IN_WINDOW = DUBLIN_DAY + " BETWEEN DATE '2025-10-01' AND DATE '2025-12-31'"
EVENT_TS = "to_timestamp(event_timestamp / 1000000)"
FIRST_PAYMENTS = "SELECT subscription_id, min(paid_at) AS paid_at, arg_min(payment_id, paid_at) AS payment_id FROM {s}.payments GROUP BY 1"


class Ga4Build(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = pathlib.Path(tempfile.mkdtemp())
        cls.connects = []
        real_connect = duckdb.connect

        def spy(*args, **kwargs):
            cls.connects.append(kwargs.get("config"))
            return real_connect(*args, **kwargs)

        with mock.patch("duckdb.connect", spy):
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

    def counts(self, schema):
        return dict(self.con.execute(f"SELECT event_name, count(*) FROM {schema}.events GROUP BY 1").fetchall())

    # ---- the lock on everything else, and R17 ----------------------------------------------------------------------------------

    def test_every_object_before_sprint9_keeps_its_rows_and_hash_and_only_the_two_schemas_are_new(self):
        self.assertEqual(len(BEFORE_SPRINT9), 379)
        moved = sorted(name for name, entry in BEFORE_SPRINT9.items() if self.manifest["tables"].get(name) != entry)
        self.assertEqual(moved, [], "objects built before sprint 9 whose rows or hash changed")
        added = sorted(set(self.manifest["tables"]) - set(BEFORE_SPRINT9))
        views = [f"{GA4}.{v}" for v in VIEWS]
        self.assertEqual(added, sorted([f"{GA4}.events"] + views + [f"{EDGE}.{t}" for t in EDGE_MIRRORS]))
        for name in added:
            self.assertEqual(len(self.manifest["tables"][name]["view_sql_sha256" if name in views else "sha256"]), 64, name)

    def test_every_duckdb_connect_passes_r17(self):
        self.assertTrue(self.connects)
        for config in self.connects:
            self.assertEqual({k: (config or {}).get(k) for k in NO_NETWORK}, NO_NETWORK)
        needle = "duckdb." + "connect("
        for path in (PIPELINE / "mailvora" / "ga4.py", PIPELINE / "mailvora" / "ga4_notes.py"):
            lines = path.read_text(encoding="utf-8").splitlines()
            for i, line in enumerate(lines):
                if needle in line and not line.lstrip().startswith("#"):
                    self.assertIn("config=NO_NETWORK", line, f"{path.name}:{i + 1}")
                    self.assertIn("SET TimeZone", "\n".join(lines[i + 1:i + 3]), f"{path.name}:{i + 1} sets TimeZone right after")

    # ---- mailvora_ga4.events: shape, window, reconciliation --------------------------------------------------------------------

    def test_events_has_s9_02s_column_types_and_the_four_views_are_mailvoras_tables(self):
        self.assertEqual(self.names(GA4), ({"events"}, set(VIEWS)))
        self.assertEqual(self.columns(GA4, "events"), EVENT_COLUMNS)
        for v in VIEWS:
            with self.subTest(view=v):
                self.assertEqual(self.columns(GA4, v), self.columns(MV, v), "the same columns as mailvora's table")
                self.assertEqual(self.manifest["tables"][f"{GA4}.{v}"]["rows"], self.manifest["tables"][f"{MV}.{v}"]["rows"], "every row")
                sql = self.one("SELECT sql FROM duckdb_views() WHERE schema_name = ? AND view_name = ?", [GA4, v])[0]
                self.assertEqual(re.findall(r"\b(?:from|join)\s+([\w.]+)", sql, flags=re.IGNORECASE), [f"{MV}.{v}"])

    def test_event_names_and_dates_are_the_property_days_of_the_window(self):
        self.assertEqual(sorted(self.counts(GA4)), EVENT_NAMES)
        self.assertEqual(self.one(f"SELECT min(event_date), max(event_date) FROM {GA4}.events"), ("20251001", "20251231"))
        wrong = self.one(f"""SELECT count(*) FROM {GA4}.events
                             WHERE event_date <> strftime({DUBLIN_DAY.format(c=EVENT_TS)}, '%Y%m%d')""")[0]
        self.assertEqual(wrong, 0, "every event_date is the event's day in Europe/Dublin")

    def test_session_start_sign_up_and_purchase_equal_mailvora_on_the_window_days(self):
        got = self.counts(GA4)
        sessions = self.one(f"SELECT count(*) FROM {MV}.sessions WHERE {IN_WINDOW.format(c='session_start')}")[0]
        signups = self.one(f"SELECT count(*) FROM {MV}.signups WHERE {IN_WINDOW.format(c='signup_ts')}")[0]
        firsts = self.one(f"SELECT count(*) FROM ({FIRST_PAYMENTS.format(s=MV)}) WHERE {IN_WINDOW.format(c='paid_at')}")[0]
        self.assertEqual((got["session_start"], got["sign_up"], got["purchase"]), (sessions, signups, firsts))
        self.assertGreater(min(sessions, signups, firsts), 0)

    def test_each_purchase_is_a_first_payment_and_each_sign_up_a_signup(self):
        # The purchase's transaction_id is the first payment's payment_id, its revenue the amount, its time the payment's second.
        unmatched = self.one(f"""SELECT count(*) FROM {GA4}.events e
            LEFT JOIN ({FIRST_PAYMENTS.format(s=MV)}) f ON CAST(f.payment_id AS VARCHAR) = e.ecommerce.transaction_id
            LEFT JOIN {MV}.payments p ON p.payment_id = f.payment_id
            WHERE e.event_name = 'purchase' AND (f.payment_id IS NULL OR e.ecommerce.purchase_revenue <> CAST(p.amount_eur AS DOUBLE)
                  OR e.event_timestamp // 1000000 <> epoch(f.paid_at))""")[0]
        self.assertEqual(unmatched, 0)
        self.assertEqual(self.one(f"SELECT count(*) FROM {GA4}.events WHERE event_name <> 'purchase' AND ecommerce IS NOT NULL")[0], 0,
                         "ecommerce is missing on every other event")
        unmatched = self.one(f"""SELECT count(*) FROM {GA4}.events e LEFT JOIN {MV}.signups u
                                 ON e.event_timestamp // 1000000 = epoch(u.signup_ts) AND coalesce(e.user_id, '') = CAST(u.user_id AS VARCHAR)
                                 WHERE e.event_name = 'sign_up' AND e.user_pseudo_id IS NOT NULL AND u.user_id IS NULL""")[0]
        self.assertEqual(unmatched, 0, "a consented sign_up carries its signup's user_id, at its signup_ts")

    def test_every_session_has_one_ga_session_id_and_its_events_share_it(self):
        # A session is user_pseudo_id with ga_session_id: the mailvora session of that visitor starting in that second.
        twice = self.one(f"""SELECT count(*) FROM {GA4}.events
                             WHERE len(event_params) <> len(list_distinct([p.key FOR p IN event_params]))""")[0]
        self.assertEqual(twice, 0, "no event names a parameter twice")
        starts = self.one(f"""SELECT count(*), count(*) FILTER (WHERE {HAS.format(k='ga_session_id')} = 1
                                                              AND {SID} = event_timestamp // 1000000)
                              FROM {GA4}.events WHERE event_name = 'session_start' AND user_pseudo_id IS NOT NULL""")
        self.assertEqual(starts[0], starts[1], "a consented session_start carries its own start second as ga_session_id")
        unmatched = self.one(f"""SELECT count(*) FROM {GA4}.events e LEFT JOIN {MV}.sessions s
                                 ON s.visitor_id = e.user_pseudo_id AND epoch(s.session_start) = {SID.replace('event_params', 'e.event_params')}
                                 WHERE e.event_name = 'session_start' AND e.user_pseudo_id IS NOT NULL AND s.session_id IS NULL""")[0]
        self.assertEqual(unmatched, 0, "each one is a mailvora session")
        self.assertEqual(self.one(f"""SELECT count(*) FROM (SELECT user_pseudo_id, {SID} FROM {GA4}.events WHERE event_name = 'session_start'
                                      AND user_pseudo_id IS NOT NULL GROUP BY ALL HAVING count(*) > 1)""")[0], 0, "one session_start a session")
        orphans = self.one(f"""SELECT count(*) FROM {GA4}.events e WHERE e.event_name IN ('first_visit', 'page_view', 'sign_up')
                               AND e.user_pseudo_id IS NOT NULL AND {SID.replace('event_params', 'e.event_params')} IS NOT NULL
                               AND NOT EXISTS (SELECT 1 FROM {GA4}.events s WHERE s.event_name = 'session_start'
                                               AND s.user_pseudo_id = e.user_pseudo_id
                                               AND {SID.replace('event_params', 's.event_params')} = {SID.replace('event_params', 'e.event_params')})""")[0]
        self.assertEqual(orphans, 0, "every first_visit, page_view and sign_up with a ga_session_id shares its session's")
        numbers = self.one(f"""SELECT count(*) FROM (SELECT user_pseudo_id, {SID} FROM {GA4}.events WHERE user_pseudo_id IS NOT NULL
                               AND {SID} IS NOT NULL GROUP BY ALL HAVING count(DISTINCT {INT.format(k='ga_session_number')}) <> 1)""")[0]
        self.assertEqual(numbers, 0, "and its ga_session_number")

    def test_each_session_has_page_views_and_a_first_visit_on_the_visitors_first_session(self):
        none = self.one(f"""SELECT count(*) FROM {GA4}.events s WHERE s.event_name = 'session_start' AND s.user_pseudo_id IS NOT NULL
                            AND NOT EXISTS (SELECT 1 FROM {GA4}.events v WHERE v.event_name = 'page_view' AND v.user_pseudo_id = s.user_pseudo_id
                                            AND {SID.replace('event_params', 'v.event_params')} = {SID.replace('event_params', 's.event_params')})""")[0]
        self.assertEqual(none, 0, "one or more page_view per session")
        more = self.one(f"""SELECT count(*) FROM (SELECT user_pseudo_id, {SID} FROM {GA4}.events WHERE event_name = 'page_view'
                            AND user_pseudo_id IS NOT NULL GROUP BY ALL HAVING count(*) > 1)""")[0]
        self.assertGreater(more, 0, "some sessions have more than one")
        # ga_session_number counts every session of the visitor in mailvora (2024 and 2025), and first_visit is on number 1.
        wrong = self.one(f"""WITH n AS (SELECT visitor_id, epoch(session_start) AS sid,
                                              row_number() OVER (PARTITION BY visitor_id ORDER BY session_start, session_id) AS k
                                       FROM {MV}.sessions)
            SELECT count(*) FILTER (WHERE n.k IS DISTINCT FROM {INT.format(k='ga_session_number').replace('event_params', 'e.event_params')}),
                   count(*) FILTER (WHERE e.event_name = 'first_visit' AND n.k <> 1)
            FROM {GA4}.events e LEFT JOIN n ON n.visitor_id = e.user_pseudo_id AND n.sid = {SID.replace('event_params', 'e.event_params')}
            WHERE e.user_pseudo_id IS NOT NULL""")
        self.assertEqual(wrong, (0, 0))
        firsts = self.one(f"""SELECT count(*) FROM (SELECT visitor_id, min(session_start) AS t FROM {MV}.sessions GROUP BY 1)
                              WHERE {IN_WINDOW.format(c='t')}""")[0]
        self.assertEqual(self.counts(GA4)["first_visit"], firsts, "first_visit on each visitor's first session, consented or not")

    def test_user_id_is_set_only_from_sign_up_on(self):
        # From the sign_up event on (a signup before the window: from its signup_ts), never before; a visitor who never signs up has none.
        at = f"""(SELECT u.visitor_id, CAST(u.user_id AS VARCHAR) AS user_id,
                         coalesce((SELECT min(s.event_timestamp) FROM {GA4}.events s WHERE s.event_name = 'sign_up' AND s.user_pseudo_id = u.visitor_id),
                                  epoch_us(u.signup_ts)) AS t
                  FROM {MV}.signups u)"""
        before, missing = self.one(f"""SELECT count(*) FILTER (WHERE e.event_timestamp < a.t AND e.user_id IS NOT NULL),
                                              count(*) FILTER (WHERE e.event_timestamp >= a.t AND e.user_id IS DISTINCT FROM a.user_id)
                                       FROM {GA4}.events e JOIN {at} a ON a.visitor_id = e.user_pseudo_id""")
        self.assertEqual((before, missing), (0, 0), "no user_id before the sign-up; the user's own from it on")
        never = self.one(f"""SELECT count(*) FROM {GA4}.events e WHERE e.user_id IS NOT NULL
                             AND NOT EXISTS (SELECT 1 FROM {MV}.signups u WHERE u.visitor_id = e.user_pseudo_id)""")[0]
        self.assertEqual(never, 0)

    def test_every_purchase_comes_from_the_billing_server_with_no_session(self):
        # S9-C17: the Measurement Protocol's purchase carries user_pseudo_id, user_id, value and ecommerce, and no session.
        n, wrong = self.one(f"""SELECT count(*), count(*) FILTER (WHERE {HAS.format(k='ga_session_id')} + {HAS.format(k='ga_session_number')}
                                       + {HAS.format(k='page_location')} + {HAS.format(k='session_engaged')} > 0
                                       OR user_pseudo_id IS NULL OR user_id IS NULL OR device IS NOT NULL OR ecommerce IS NULL
                                       OR [p.key FOR p IN event_params] <> ['value'])
                                FROM {GA4}.events WHERE event_name = 'purchase'""")
        self.assertGreater(n, 0)
        self.assertEqual(wrong, 0)
        names = ", ".join(f"('{c}', '{name}')" for c, name in ga4.COUNTRY_NAMES.items())
        country = self.one(f"""SELECT count(*) FROM {GA4}.events e JOIN {MV}.signups u ON CAST(u.user_id AS VARCHAR) = e.user_id
                               JOIN (VALUES {names}) AS c(code, name) ON c.code = u.country_code
                               WHERE e.event_name = 'purchase' AND e.geo.country <> c.name""")[0]
        self.assertEqual(country, 0, "its geo is the account's country")

    def test_a_sign_up_is_in_its_latest_session_when_it_fits_and_sent_by_the_server_otherwise(self):
        in_session = f"""SELECT e.user_pseudo_id, e.event_timestamp, {SID.replace('event_params', 'e.event_params')} AS sid FROM {GA4}.events e
                         WHERE e.event_name = 'sign_up' AND {SID.replace('event_params', 'e.event_params')} IS NOT NULL"""
        wrong = self.one(f"""SELECT count(*) FROM ({in_session}) k WHERE k.sid IS DISTINCT FROM
                             (SELECT max(epoch(s.session_start)) FROM {MV}.sessions s
                              WHERE s.visitor_id = k.user_pseudo_id AND epoch_us(s.session_start) <= k.event_timestamp)""")[0]
        self.assertEqual(wrong, 0, "in the visitor's latest session started at or before it")
        server, misshapen = self.one(f"""SELECT count(*), count(*) FILTER (WHERE {HAS.format(k='ga_session_id')} > 0
                                                OR user_pseudo_id IS NULL OR user_id IS NULL OR device IS NOT NULL)
                                         FROM {GA4}.events WHERE event_name = 'sign_up' AND NOT ({WEBSITE})""")
        self.assertEqual(misshapen, 0, "a server-side sign_up is shaped as a purchase")
        lost = self.one(f"SELECT count(*) FROM {GA4}.events WHERE event_name = 'sign_up' AND {WEBSITE} AND user_pseudo_id IS NOT NULL AND {SID} IS NULL")[0]
        self.assertEqual(lost, 0, "a consented website sign_up has its session")
        self.assertLess(server, 100, "Mailvora's signups come 2 to 30 minutes after their session's start: only a few miss it")

    def test_no_event_of_a_session_comes_more_than_30_minutes_after_the_one_before(self):
        self.assertEqual(self.one(f"SELECT count(*) FROM ({GAPS.format(schema=GA4)}) WHERE gap > {THIRTY_MINUTES_US}")[0], 0)
        self.assertGreater(self.one(f"SELECT max(gap) FROM ({GAPS.format(schema=GA4)})")[0], 10 * 60 * 1_000_000, "page views spread inside it")

    def test_each_later_page_view_follows_the_one_before_by_its_engagement_time(self):
        # L1-R4: the next page_view of a session comes engagement_time_msec after the one before, to within 1 ms.
        pairs, off = self.one(f"""SELECT count(*), count(*) FILTER (WHERE NOT (next_ts - event_timestamp BETWEEN msec * 1000 AND msec * 1000 + 999))
            FROM (SELECT event_timestamp, {INT.format(k='engagement_time_msec')} AS msec,
                         lead(event_timestamp) OVER (PARTITION BY user_pseudo_id, {SID} ORDER BY event_timestamp) AS next_ts
                  FROM {GA4}.events WHERE event_name = 'page_view' AND {SID} IS NOT NULL) WHERE next_ts IS NOT NULL""")
        self.assertGreater(pairs, 0)
        self.assertEqual(off, 0)

    def test_the_distinct_session_pairs_are_the_session_starts_that_carry_them(self):
        pairs, starts = self.one(f"""SELECT
            (SELECT count(*) FROM (SELECT DISTINCT user_pseudo_id, {SID} FROM {GA4}.events WHERE user_pseudo_id IS NOT NULL AND {SID} IS NOT NULL)),
            (SELECT count(*) FROM {GA4}.events WHERE event_name = 'session_start' AND user_pseudo_id IS NOT NULL AND {SID} IS NOT NULL)""")
        self.assertEqual(pairs, starts)

    def test_the_other_params_and_records(self):
        # page_location is on mailvora.example; session_engaged is '1' or '0'; engagement_time_msec is a whole number on page_view.
        hosts = self.col(f"SELECT DISTINCT regexp_extract({STR.format(k='page_location')}, '^https://[^/]+') FROM {GA4}.events WHERE {WEBSITE}")
        self.assertEqual(hosts, [ga4.HOST])
        self.assertEqual(self.one(f"SELECT count(*) FROM {GA4}.events WHERE {STR.format(k='page_location')} LIKE '%?%'")[0], 0,
                         "no query string on the visible data (S9-03 plants one in the edge)")
        self.assertEqual(self.col(f"SELECT DISTINCT {STR.format(k='session_engaged')} FROM {GA4}.events WHERE {WEBSITE} ORDER BY 1"), ["0", "1"])
        self.assertEqual(self.one(f"SELECT count(*) FROM {GA4}.events WHERE NOT ({WEBSITE}) AND event_name NOT IN ('purchase', 'sign_up')")[0], 0,
                         "only purchases and server-side sign_ups lack page_location")
        self.assertEqual(self.one(f"""SELECT count(*) FROM {GA4}.events WHERE event_name = 'page_view'
                                      AND NOT coalesce({INT.format(k='engagement_time_msec')} > 0, false)""")[0], 0)
        self.assertEqual(self.one(f"SELECT count(*) FROM {GA4}.events, unnest(event_params) AS t(p) WHERE p.value.float_value IS NOT NULL")[0], 0,
                         "float_value is not in use (07 §5.2)")
        self.assertEqual(self.col(f"SELECT DISTINCT device.category FROM {GA4}.events WHERE {WEBSITE} ORDER BY 1"), ["desktop", "mobile", "tablet"])
        self.assertEqual(sorted(self.col(f"SELECT DISTINCT geo.country FROM {GA4}.events")), sorted(ga4.COUNTRY_NAMES.values()))
        direct = self.one(f"""SELECT count(*) FROM {GA4}.events WHERE traffic_source.source = '(direct)'
                              AND (traffic_source.medium <> '(none)' OR traffic_source.name <> '(direct)')""")[0]
        self.assertEqual(direct, 0)
        self.assertEqual(self.one(f"SELECT count(*) FROM {GA4}.events WHERE traffic_source IS NULL OR traffic_source.source IS NULL")[0], 0)

    # ---- the plants (S9-02) ----------------------------------------------------------------------------------------------------

    def test_value_sits_in_int_value_for_the_stated_share_of_purchases(self):
        n, in_int, in_double, both = self.one(f"""SELECT count(*), count(*) FILTER (WHERE {INT.format(k='value')} IS NOT NULL),
                                                         count(*) FILTER (WHERE {DBL.format(k='value')} IS NOT NULL),
                                                         count(*) FILTER (WHERE {HAS.format(k='value')} <> 1)
                                                  FROM {GA4}.events WHERE event_name = 'purchase'""")
        self.assertEqual((in_int + in_double, both), (n, 0), "one value a purchase, in one slot")
        self.assertEqual(in_int, round(n * ga4.INT_VALUE_SHARE))
        off = self.one(f"""SELECT count(*) FROM {GA4}.events WHERE event_name = 'purchase'
                           AND coalesce({INT.format(k='value')}, {DBL.format(k='value')}) <> ecommerce.purchase_revenue""")[0]
        self.assertEqual(off, 0, "either slot holds the revenue")
        self.assertEqual(self.one(f"SELECT count(*) FROM {GA4}.events WHERE event_name <> 'purchase' AND {HAS.format(k='value')} > 0")[0], 0)

    def test_two_visitors_share_a_ga_session_id(self):
        shared = self.one(f"""SELECT count(*) FROM (SELECT {SID} FROM {GA4}.events WHERE event_name = 'session_start'
                                                    AND user_pseudo_id IS NOT NULL GROUP BY 1 HAVING count(DISTINCT user_pseudo_id) > 1)""")[0]
        self.assertGreater(shared, 0)

    def test_about_two_percent_of_events_have_neither_user_pseudo_id_nor_ga_session_id(self):
        total, denied, mixed = self.one(f"""SELECT count(*), count(*) FILTER (WHERE user_pseudo_id IS NULL),
                count(*) FILTER (WHERE {WEBSITE} AND ((user_pseudo_id IS NULL) <> ({HAS.format(k='ga_session_id')} = 0)
                                 OR (user_pseudo_id IS NULL AND ({HAS.format(k='ga_session_number')} > 0 OR user_id IS NOT NULL))))
            FROM {GA4}.events""")
        self.assertTrue(0.015 <= denied / total <= 0.025, round(denied / total, 4))
        self.assertEqual(mixed, 0, "consent denied on a website event: both missing together, and no user_id or ga_session_number either")

    def test_event_date_is_the_next_day_after_23_utc_before_26_october_and_never_after(self):
        before, moved, after, kept = self.one(f"""SELECT
                count(*) FILTER (WHERE d < DATE '2025-10-26'), count(*) FILTER (WHERE d < DATE '2025-10-26' AND event_date = strftime(d + 1, '%Y%m%d')),
                count(*) FILTER (WHERE d >= DATE '2025-10-26'), count(*) FILTER (WHERE d >= DATE '2025-10-26' AND event_date = strftime(d, '%Y%m%d'))
            FROM (SELECT event_date, CAST({EVENT_TS} AS DATE) AS d FROM {GA4}.events WHERE hour({EVENT_TS}) = 23)""")
        self.assertGreater(before, 0)
        self.assertGreater(after, 0)
        self.assertEqual((moved, kept), (before, after))

    def test_the_sample_stays_under_the_row_cap_and_a_second_generation_gives_the_same_hash(self):
        rows = self.manifest["tables"][f"{GA4}.events"]["rows"]
        self.assertLess(rows, ga4.ROW_CAP)
        self.assertEqual(rows, sum(self.counts(GA4).values()))
        tables, _ = build_course_db.mv.generate()
        again = ga4.generate(tables["clean"])
        con = duckdb.connect(config=NO_NETWORK)
        con.execute("SET TimeZone = 'UTC'")
        self.addCleanup(con.close)
        ddl = build_course_db.MAILVORA_GA4_DDL.read_text(encoding="utf-8").replace("{schema}", GA4)
        con.execute(";".join(s for s in ddl.split(";") if "CREATE VIEW" not in s))   # the table only: no mailvora here
        con.register("src", again["events"])
        con.execute(f"INSERT INTO {GA4}.events SELECT * FROM src")
        self.assertEqual(build_course_db.table_sha(con, f"{GA4}.events"), self.manifest["tables"][f"{GA4}.events"]["sha256"])

    def test_its_draws_have_their_own_seed(self):
        self.assertNotEqual(ga4.SEED, mv.SEED)
        self.assertNotIn("ga4", mv.TABLE_ORDER, "no Mailvora stream is added or moved")

    # ---- the notes -------------------------------------------------------------------------------------------------------------

    def test_the_notes_are_mailvoras_shape_from_level_7_with_a_json_safe_sample(self):
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        mine = [n for n in notes if n["schema"] == GA4]
        self.assertEqual([n["table"] for n in mine], ["events", *VIEWS])
        n = mine[0]
        self.assertEqual(n["from_level"], 7)
        self.assertTrue(n["grain"].startswith("one row per event"), n["grain"])
        self.assertEqual((n["primary_key"], n["foreign_keys"]), ([], []))
        self.assertEqual(n["row_count"], self.one(f"SELECT count(*) FROM {GA4}.events")[0])
        self.assertEqual(n["sample"]["columns"], [c for c, _ in EVENT_COLUMNS])
        self.assertEqual(len(n["sample"]["rows"]), 5)
        row = dict(zip(n["sample"]["columns"], n["sample"]["rows"][0]))
        self.assertEqual(json.loads(json.dumps(row)), row, "the sample row is JSON")
        self.assertIsInstance(row["event_params"], list)
        for p in row["event_params"]:
            self.assertEqual((set(p), set(p["value"])), ({"key", "value"}, {"string_value", "int_value", "float_value", "double_value"}))
        self.assertEqual(n["allowed_values"], {"event_name": EVENT_NAMES})
        text = " ".join([n["grain"], *n["column_notes"].values()])
        for words in ("Europe/Dublin", "BigQuery stores one table per day, events_YYYYMMDD; here the days are stacked in one table",
                      "microseconds", "UTC", "consent", "ga_session_id", "user_pseudo_id with ga_session_id", "mailvora.example",
                      f"{round(ga4.INT_VALUE_SHARE * 100)}%", "latest session", "every session of the visitor", "Ireland",
                      "sessions whose session_start", "signup_ts", "paid_at", "Measurement Protocol", "belongs to no session",
                      "common in real exports", "within 30 minutes", "account's country", "sessions.visitor_id",
                      "payments.payment_id", "the time spent on that page", "session_engaged is '1' when the session has 2 or more page_view",
                      "payments.refunded marks the refund"):
            self.assertIn(words, text)
        purchases, refunded = self.one(f"""SELECT count(*), count(*) FILTER (WHERE p.refunded) FROM {GA4}.events e
                                           JOIN {MV}.payments p ON CAST(p.payment_id AS VARCHAR) = e.ecommerce.transaction_id
                                           WHERE e.event_name = 'purchase'""")
        self.assertGreater(refunded, 0)
        self.assertIn(f"({refunded:,} of the {purchases:,} purchases)", text, "L1-R3: the purchases of refunded first payments, counted")
        self.assertEqual(set(n["column_notes"]) - {c for c, _ in EVENT_COLUMNS}, set(), "notes name real columns")
        raw = json.dumps(n, ensure_ascii=False)
        self.assertNotIn("—", raw, "no em dash")
        self.assertNotIn("NULL", " ".join(n["column_notes"].values()) + n["grain"], "missing, not NULL")
        self.assertNotRegex(text, r"(?i)\b(he|she|him|her|his|hers)\b", "no gendered pronoun")
        self.assertFalse([x for x in notes if x["schema"] == EDGE], "an edge schema has no table notes")
        # S9-C18: each view keeps Mailvora's note for its table, from level 7, with the sentence on what it is.
        own = {x["table"]: x for x in notes if x["schema"] == MV}
        for view in mine[1:]:
            with self.subTest(view=view["table"]):
                source = own[view["table"]]
                rows = self.manifest["tables"][f"{MV}.{view['table']}"]["rows"]
                self.assertTrue(view["grain"].startswith(f"the same as Mailvora's {view['table']} table, here so a query can join it to "
                                                         f"events: every Mailvora row, {rows:,} rows from "), view["grain"])
                self.assertIn("a wider span than events, which covers the Dublin days 1 October to 31 December 2025.", view["grain"])
                self.assertTrue(view["grain"].endswith(source["grain"][0].upper() + source["grain"][1:]), view["grain"])
                self.assertEqual((view["primary_key"], view["from_level"], view["row_count"]), (source["primary_key"], 7, source["row_count"]))
                self.assertEqual(view["sample"], source["sample"])
                self.assertEqual(view["foreign_keys"], [f for f in source["foreign_keys"] if f["ref_table"] in VIEWS], "links inside the schema only")
        self.assertIn("1,983,227 rows from 1 January 2024 to 31 December 2025 by session_start",
                      next(v for v in mine if v["table"] == "sessions")["grain"], "sessions from 2024, with the count")

    def test_no_note_names_a_table_this_schema_lacks(self):
        # L1-R1, L1-R2 (S9-C28): a graded query names no schema, so a note may point only to events and the four views. Every
        # schema.table or table.column a note names starts with one of them, and no other Mailvora table is named at all.
        notes = [n for n in json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8")) if n["schema"] == GA4]
        own = {"events", *VIEWS}
        others = set(build_course_db.mv.CLEAN_TABLES) - own
        self.assertEqual(others, {"channels", "campaigns", "ad_spend_daily", "fx_rates_monthly", "activation_events", "budget_monthly",
                                  "countries"})
        for n in notes:
            text = " ".join([n["grain"], *n.get("column_notes", {}).values()]).replace(ga4.HOST.split("//")[1], "")
            with self.subTest(table=n["table"]):
                named = set(re.findall(r"\b([A-Za-z_]\w*)\.[A-Za-z_]\w*", text))
                self.assertEqual(named - own, set(), "a qualified name outside this schema")
                self.assertEqual({t for t in others if re.search(rf"\b{t}\b", text)}, set(), "a Mailvora table this schema lacks")
                self.assertNotIn("mailvora.", text.lower())

    # ---- the edge schema (S9-03) -----------------------------------------------------------------------------------------------

    def test_the_edge_mirrors_events_and_the_four_mailvora_tables(self):
        tables, views = self.names(EDGE)
        self.assertEqual((tables, views), (set(EDGE_MIRRORS), set()))
        for t, source in EDGE_MIRRORS.items():
            self.assertEqual(self.columns(EDGE, t), self.columns(source, t), f"{EDGE}.{t} mirrors {source}.{t}")
            self.assertTrue(1 <= self.one(f"SELECT count(*) FROM {EDGE}.{t}")[0] <= 60, t)
        self.assertNotIn(EDGE, build_course_db.RAW_EDGE_SCHEMAS)

    def test_the_edge_follows_the_sample_rules_beside_its_plants(self):
        got = self.counts(EDGE)
        sessions, signups = self.one(f"SELECT (SELECT count(*) FROM {EDGE}.sessions), (SELECT count(*) FROM {EDGE}.signups)")
        firsts = self.one(f"SELECT count(*) FROM ({FIRST_PAYMENTS.format(s=EDGE)})")[0]
        self.assertEqual((got.get("session_start"), got.get("sign_up"), got.get("purchase")), (sessions, signups, firsts))
        self.assertGreater(self.one(f"SELECT count(*) FROM {EDGE}.payments")[0], firsts, "a later payment is no purchase")
        wrong = self.one(f"SELECT count(*) FROM {EDGE}.events WHERE event_date <> strftime({DUBLIN_DAY.format(c=EVENT_TS)}, '%Y%m%d')")[0]
        self.assertEqual(wrong, 0, "every event_date is the Dublin day")
        unmatched = self.one(f"""SELECT count(*) FROM {EDGE}.events e LEFT JOIN ({FIRST_PAYMENTS.format(s=EDGE)}) f
                                 ON CAST(f.payment_id AS VARCHAR) = e.ecommerce.transaction_id
                                 WHERE e.event_name = 'purchase' AND f.payment_id IS NULL""")[0]
        self.assertEqual(unmatched, 0)
        server = self.one(f"""SELECT count(*) FROM {EDGE}.events WHERE event_name = 'purchase' AND ({HAS.format(k='ga_session_id')} > 0
                              OR {WEBSITE} OR user_pseudo_id IS NULL OR user_id IS NULL OR device IS NOT NULL)""")[0]
        self.assertEqual(server, 0, "its purchases come from the billing server, with no session (S9-C17)")
        self.assertEqual(self.one(f"SELECT count(*) FROM ({GAPS.format(schema=EDGE)}) WHERE gap > {THIRTY_MINUTES_US}")[0], 0)
        self.assertEqual(self.one(f"""SELECT count(*) FROM {EDGE}.events e LEFT JOIN {EDGE}.sessions s ON s.visitor_id = e.user_pseudo_id
                                      AND epoch(s.session_start) = {SID.replace('event_params', 'e.event_params')}
                                      WHERE e.event_name = 'session_start' AND s.session_id IS NULL""")[0], 0, "each session_start is a session")

    def test_edge_plant_an_event_with_an_empty_event_params(self):
        self.assertEqual(self.one(f"SELECT count(*) FROM {EDGE}.events WHERE len(event_params) = 0")[0], 1)

    def test_edge_plant_a_purchase_with_value_in_int_value(self):
        n_int, n_double = self.one(f"""SELECT count(*) FILTER (WHERE {INT.format(k='value')} IS NOT NULL AND {DBL.format(k='value')} IS NULL),
                                              count(*) FILTER (WHERE {DBL.format(k='value')} IS NOT NULL)
                                       FROM {EDGE}.events WHERE event_name = 'purchase'""")
        self.assertEqual((n_int, n_double >= 1), (1, True))

    def test_edge_plant_two_visitors_sharing_a_ga_session_id(self):
        self.assertEqual(self.one(f"""SELECT count(*) FROM (SELECT {SID} FROM {EDGE}.events WHERE event_name = 'session_start'
                                      GROUP BY 1 HAVING count(DISTINCT user_pseudo_id) = 2)""")[0], 1)

    def test_edge_plant_an_event_with_no_ga_session_id(self):
        self.assertEqual(self.one(f"""SELECT count(*) FROM {EDGE}.events WHERE user_pseudo_id IS NOT NULL AND {WEBSITE}
                                      AND {HAS.format(k='ga_session_id')} = 0""")[0], 1)

    def test_edge_plant_an_event_with_no_user_pseudo_id(self):
        self.assertEqual(self.one(f"SELECT count(*) FROM {EDGE}.events WHERE user_pseudo_id IS NULL AND {HAS.format(k='ga_session_id')} = 1")[0], 1)

    def test_edge_plant_both_sides_of_the_dublin_day_boundary(self):
        rows = self.con.execute(f"""SELECT strftime({EVENT_TS}, '%Y-%m-%d %H:%M'), event_date FROM {EDGE}.events
                                    WHERE strftime({EVENT_TS}, '%H:%M') = '23:30' ORDER BY 1""").fetchall()
        self.assertEqual(rows, [("2025-10-25 23:30", "20251026"), ("2025-10-27 23:30", "20251027")])

    def test_edge_plant_a_sign_up_dated_1_october_in_dublin_and_30_september_in_utc(self):
        # S9-C42 (review F2-1-1): a new visitor's first session and sign_up just after midnight in Dublin on 1 October 2025, still
        # 30 September by the UTC day, with its sessions and signups rows: a window from 1 October read by the UTC day, on the
        # export side or the backend side, loses them.
        events = self.con.execute(f"""SELECT event_name, event_date, strftime({EVENT_TS}, '%Y%m%d') FROM {EDGE}.events
                                      WHERE event_date = '20251001' OR strftime({EVENT_TS}, '%Y%m%d') = '20250930'""").fetchall()
        self.assertEqual({(d, u) for _, d, u in events}, {("20251001", "20250930")})
        self.assertEqual(sorted(n for n, _, _ in events), ["first_visit", "page_view", "page_view", "session_start", "sign_up"])
        for table, column in (("sessions", "session_start"), ("signups", "signup_ts")):
            moved = self.one(f"""SELECT count(*) FROM {EDGE}.{table}
                                 WHERE CAST({column} AS DATE) = DATE '2025-09-30' AND {DUBLIN_DAY.format(c=column)} = DATE '2025-10-01'""")[0]
            self.assertEqual(moved, 1, table)
        matched = self.one(f"""SELECT count(*) FROM {EDGE}.events e JOIN {EDGE}.signups u ON CAST(u.user_id AS VARCHAR) = e.user_id
                               AND u.visitor_id = e.user_pseudo_id AND epoch(u.signup_ts) = e.event_timestamp // 1000000
                               WHERE e.event_name = 'sign_up' AND e.event_date = '20251001'""")[0]
        self.assertEqual(matched, 1, "the sign_up is its signups row")

    def test_edge_plant_a_page_location_with_a_query_string(self):
        self.assertEqual(self.one(f"SELECT count(*) FROM {EDGE}.events WHERE {STR.format(k='page_location')} LIKE '%?%'")[0], 1)

    def test_edge_page_views_follow_by_their_engagement_time(self):
        # L1-R4: as on the visible data, an event of the session comes engagement_time_msec after each page_view that has a later one.
        off = self.one(f"""SELECT count(*) FROM {EDGE}.events v
            WHERE v.event_name = 'page_view' AND {SID.replace('event_params', 'v.event_params')} IS NOT NULL
              AND EXISTS (SELECT 1 FROM {EDGE}.events w WHERE w.event_name = 'page_view' AND w.user_pseudo_id = v.user_pseudo_id
                          AND {SID.replace('event_params', 'w.event_params')} = {SID.replace('event_params', 'v.event_params')}
                          AND w.event_timestamp > v.event_timestamp)
              AND NOT EXISTS (SELECT 1 FROM {EDGE}.events x WHERE x.event_timestamp - v.event_timestamp
                              BETWEEN {INT.format(k='engagement_time_msec').replace('event_params', 'v.event_params')} * 1000
                                  AND {INT.format(k='engagement_time_msec').replace('event_params', 'v.event_params')} * 1000 + 999)""")[0]
        self.assertEqual(off, 0)

    def test_edge_plant_a_purchase_whose_first_payment_is_refunded(self):
        # S9-C29: the purchase is there, and payments marks its first payment refunded.
        self.assertEqual(self.one(f"""SELECT count(*) FROM {EDGE}.events e JOIN ({FIRST_PAYMENTS.format(s=EDGE)}) f
                                      ON CAST(f.payment_id AS VARCHAR) = e.ecommerce.transaction_id
                                      JOIN {EDGE}.payments p ON p.payment_id = f.payment_id
                                      WHERE e.event_name = 'purchase' AND p.refunded""")[0], 1)

    def test_edge_plant_a_session_with_no_page_view(self):
        bare = self.one(f"""SELECT count(*) FROM {EDGE}.events s WHERE s.event_name = 'session_start'
                            AND NOT EXISTS (SELECT 1 FROM {EDGE}.events v WHERE v.event_name = 'page_view' AND v.user_pseudo_id = s.user_pseudo_id
                                            AND {SID.replace('event_params', 'v.event_params')} = {SID.replace('event_params', 's.event_params')})""")[0]
        self.assertEqual(bare, 1)

    def test_the_edge_description_lists_each_plant_under_its_tables(self):
        desc = json.loads((ROOT / "content" / "sql" / "edge" / f"{EDGE}.json").read_text(encoding="utf-8"))
        tables, views = self.names(EDGE)
        self.assertEqual((desc["schema"], desc["mirrors"], desc["family"]), (EDGE, GA4, "ga4"))
        self.assertEqual(len(desc["contains"]), 10, "one line per S9-03 plant, S9-C29's and S9-C42's")
        self.assertEqual(len(set(desc["contains"])), len(desc["contains"]))
        self.assertTrue(desc["tables"] and set(desc["tables"]) <= tables | views)
        listed = [line for lines in desc["tables"].values() for line in lines]
        self.assertEqual(set(listed), set(desc["contains"]), "every line sits under a table, and only those")
        for table, lines in desc["tables"].items():
            self.assertEqual(lines, [x for x in desc["contains"] if x in lines], f"{table}: lines once each, in their order")
        self.assertEqual(desc["tables"]["events"], desc["contains"])
        text = " ".join(desc["contains"])
        for word in ("empty", "int_value", "share a ga_session_id", "page_view with no ga_session_id", "no user_pseudo_id", "20251026", "20251027",
                     "20251001", "query string", "no page_view", "first payment was later refunded"):
            self.assertIn(word, text)
        # Review F2-1-3: two purchases carry value in double_value since S9-C29 (users 1 and 3), and the line is about an events parameter.
        int_line = next(x for x in desc["contains"] if "int_value" in x)
        self.assertIn("beside two whose value is in double_value", int_line)
        self.assertEqual([t for t, lines in desc["tables"].items() if int_line in lines], ["events"])
        day_line = next(x for x in desc["contains"] if "20251001" in x)
        self.assertEqual(sorted(t for t, lines in desc["tables"].items() if day_line in lines), ["events", "sessions", "signups"])
        raw = json.dumps(desc, ensure_ascii=False)
        self.assertNotIn("—", raw, "no em dash")
        self.assertNotIn("NULL", raw, "missing, not NULL")
        self.assertNotRegex(raw, r"(?i)\b(he|she|him|her|his|hers)\b", "no gendered pronoun")
        self.assertIsNone(re.search(r"\bV9\d{6}\b", raw), "no visitor ID in the description")


if __name__ == "__main__":
    unittest.main()

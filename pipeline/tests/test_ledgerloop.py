"""Sprint 8 Task L1: LedgerLoop (knowledge/05 CO-02; rulings S8-01 to S8-06, E-208), as the generator returns it.

Each of 05's 15 findings is measured here in SQL, apart from the generator's own validate(), and held to 05 §5's band. A finding not
about cleaning reads the clean tables (OD-GEN-01, E-093); the cleaning findings FIND-02-12 and -13 read raw. Each quirk Q-02-01 to
-07 exists in raw and not in clean. S8-02's one MRR source is reconciled for every month and every subscription. The truth file
records what the data holds, so each finding's measure is also compared with it. Assertion messages name data facts, IDs and counts
only, never a measured value.
"""
import collections
import copy
import datetime as dt
import json
import pathlib
import sys
import unittest
from decimal import ROUND_HALF_UP, Decimal
from unittest import mock

import duckdb
import pyarrow as pa

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from ledgerloop import generate as ll  # noqa: E402
from ledgerloop import notes as ll_notes  # noqa: E402
from ledgerloop import raw as ll_raw  # noqa: E402
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ledgerloop_once  # noqa: E402
from course_build import build_course_db  # noqa: E402  (sprint 8 Part 2: the mrr_monthly view's SQL)

NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17
DDL = pathlib.Path(ll.__file__).resolve().parent / "ddl.sql"
TS, TSTZ = "TIMESTAMP", "TIMESTAMP WITH TIME ZONE"
# 05 CO-02's eleven tables (DuckDB types), then S8-01's five appended ones (S8-05, S8-06). Clean payments.attempted_at is a local
# TIMESTAMP like every other clean time (Q-02-04 is raw's); app_events.event_ts is a UTC TIMESTAMPTZ (S8-06).
COLUMNS = {
    "accounts": [("account_id", "INTEGER"), ("account_name", "VARCHAR"), ("country_code", "VARCHAR"), ("segment", "VARCHAR"),
                 ("employee_band", "VARCHAR"), ("industry", "VARCHAR"), ("acquisition_channel", "VARCHAR"), ("created_at", TS),
                 ("is_test", "BOOLEAN")],
    "plans": [("plan_id", "INTEGER"), ("plan_name", "VARCHAR"), ("list_price_eur_month", "DECIMAL(10,2)"), ("valid_from", "DATE"),
              ("valid_to", "DATE")],
    "subscriptions": [("subscription_id", "INTEGER"), ("account_id", "INTEGER"), ("plan_id", "INTEGER"), ("billing_period", "VARCHAR"),
                      ("currency", "VARCHAR"), ("start_date", "DATE"), ("end_date", "DATE"), ("mrr_local", "DECIMAL(12,2)")],
    "subscription_events": [("event_id", "BIGINT"), ("subscription_id", "INTEGER"), ("account_id", "INTEGER"), ("event_type", "VARCHAR"),
                            ("event_date", "DATE"), ("mrr_delta_local", "DECIMAL(12,2)"), ("recorded_at", TS)],
    "invoices": [("invoice_id", "BIGINT"), ("account_id", "INTEGER"), ("subscription_id", "INTEGER"), ("invoice_date", "DATE"),
                 ("amount_local", "DECIMAL(12,2)"), ("currency", "VARCHAR"), ("status", "VARCHAR")],
    "payments": [("payment_id", "BIGINT"), ("invoice_id", "BIGINT"), ("attempt_no", "INTEGER"), ("attempted_at", TS),
                 ("succeeded", "BOOLEAN"), ("failure_reason", "VARCHAR")],
    "fx_rates": [("rate_date", "DATE"), ("currency", "VARCHAR"), ("eur_per_unit", "DECIMAL(12,6)")],
    "users": [("user_id", "BIGINT"), ("account_id", "INTEGER"), ("role", "VARCHAR"), ("invited_at", TS), ("deactivated_at", TS)],
    "usage_weekly": [("account_id", "INTEGER"), ("week_start", "DATE"), ("active_users", "INTEGER"), ("reconciliations_run", "INTEGER"),
                     ("ap_module_events", "INTEGER")],
    "support_tickets": [("ticket_id", "BIGINT"), ("account_id", "INTEGER"), ("opened_at", TS), ("category", "VARCHAR"),
                        ("priority", "VARCHAR"), ("resolved_at", TS)],
    "marketing_spend_monthly": [("month", "DATE"), ("channel", "VARCHAR"), ("spend_eur", "DECIMAL(12,2)")],
    "leads": [("lead_id", "BIGINT"), ("created_at", TS), ("source", "VARCHAR"), ("segment", "VARCHAR"), ("email", "VARCHAR")],
    "opportunities": [("opportunity_id", "BIGINT"), ("lead_id", "BIGINT"), ("account_id", "INTEGER"), ("created_at", TS),
                      ("stage", "VARCHAR"), ("closed_at", TS), ("is_won", "BOOLEAN"), ("amount_eur", "DECIMAL(12,2)")],
    "cogs_monthly": [("month", "DATE"), ("cost_type", "VARCHAR"), ("amount_eur", "DECIMAL(12,2)")],
    "sm_expense_monthly": [("month", "DATE"), ("channel", "VARCHAR"), ("cost_type", "VARCHAR"), ("amount_eur", "DECIMAL(12,2)")],
    "app_events": [("event_id", "BIGINT"), ("user_id", "BIGINT"), ("account_id", "INTEGER"), ("event_ts", TSTZ), ("event_name", "VARCHAR")],
}
CO02_TABLES = ["accounts", "plans", "subscriptions", "subscription_events", "invoices", "payments", "fx_rates", "users",
               "usage_weekly", "support_tickets", "marketing_spend_monthly"]
APPENDED = ["leads", "opportunities", "cogs_monthly", "sm_expense_monthly", "app_events"]          # S8-01, in this order
# 05 CO-02's row counts. S8-04 (E-084): where 05's prices, FIND-02-01 and the ARR path cannot hold with a count, the generator
# changes the count and declares it in ll.S8_04_VOLUMES with its reason; these are the tables it may change.
VOLUMES = {"accounts": 4000, "plans": 8, "subscriptions": 5500, "subscription_events": 14000, "invoices": 70000, "payments": 80000,
           "fx_rates": 2193, "users": 30000, "usage_weekly": 230000, "support_tickets": 25000, "marketing_spend_monthly": 120}
S8_04_TABLES = {"accounts", "plans", "subscriptions", "subscription_events", "invoices", "payments", "usage_weekly"}
# The clean primary keys: CO-02's, then the appended tables' own.
KEYS = {"accounts": ["account_id"], "plans": ["plan_id"], "subscriptions": ["subscription_id"], "subscription_events": ["event_id"],
        "invoices": ["invoice_id"], "payments": ["payment_id"], "fx_rates": ["rate_date", "currency"], "users": ["user_id"],
        "usage_weekly": ["account_id", "week_start"], "support_tickets": ["ticket_id"], "marketing_spend_monthly": ["month", "channel"],
        "leads": ["lead_id"], "opportunities": ["opportunity_id"], "cogs_monthly": ["month", "cost_type"],
        "sm_expense_monthly": ["month", "channel", "cost_type"], "app_events": ["event_id"]}
QUIRK_TABLES = {"accounts", "subscriptions", "subscription_events", "invoices", "payments"}   # Q-02-01 to -07
EVENT_TYPES = {"opening", "new", "expansion", "contraction", "churn", "reactivation"}            # S8-02
PAID_MEDIA = {"paid_search", "paid_social", "review_sites", "display", "events"}
_GENERATED = None

# The month ends of the window, and each subscription's MRR in force at each (S8-02: the sum of its events up to that date).
MONTH_ENDS_SQL = """CREATE TABLE {s}.month_ends AS
SELECT CAST(range + INTERVAL 1 MONTH - INTERVAL 1 DAY AS DATE) AS month_end, CAST(range AS DATE) AS month_start
FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH)"""
IN_FORCE_SQL = """CREATE TABLE clean.in_force AS
SELECT s.subscription_id, s.account_id, s.currency, s.start_date, s.end_date, m.month_end,
       coalesce(sum(e.mrr_delta_local) FILTER (WHERE e.event_date <= m.month_end), 0) AS mrr
FROM clean.subscriptions s CROSS JOIN clean.month_ends m LEFT JOIN clean.subscription_events e USING (subscription_id)
GROUP BY ALL"""
# An account's MRR (local) on a date, and in EUR at one date's rate.
ACCOUNT_MRR_SQL = """SELECT s.account_id, any_value(s.currency) AS currency, coalesce(sum(e.mrr_delta_local), 0) AS mrr
FROM clean.subscriptions s JOIN clean.subscription_events e USING (subscription_id) WHERE e.event_date <= DATE '{d}' GROUP BY 1"""


def generated():
    """One generation shared by the test classes, with the build's validation run once."""
    global _GENERATED
    if _GENERATED is None:
        tables, truth, findings = ledgerloop_once.generated()
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
        con.execute(MONTH_ENDS_SQL.format(s=schema))
    con.execute(IN_FORCE_SQL)
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

    def close(self, a, b, tol, what):
        """The truth file records the value measured here (no value in the message)."""
        self.assertTrue(abs(float(a) - float(b)) <= tol, f"{what}: the truth file records the measured value")

    def band(self, value, low, high, what):
        self.assertTrue(low <= float(value) <= high, f"{what}: outside 05's band {low} to {high}")

    def eur_at(self, d):
        """Each account's MRR on date d, local and in EUR at d's rate."""
        return f"""WITH a AS ({ACCOUNT_MRR_SQL.format(d=d)})
                   SELECT a.account_id, a.mrr, a.mrr * fx.eur_per_unit AS eur FROM a
                   JOIN clean.fx_rates fx ON fx.rate_date = DATE '{d}' AND fx.currency = a.currency"""


class Tables(Fixture):
    def test_seed_and_generation_order(self):
        self.assertEqual(ll.SEED, 2202)
        # 05's CO-02 generation order, then S8-01's five tables appended in this order (GEN-02: new tables go at the end).
        self.assertEqual(ll.TABLE_ORDER, ["calendar", "fx_rates", "plans", "accounts", "subscriptions_and_events", "users",
                                          "usage_weekly", "invoices", "payments", "support_tickets", "marketing_spend_monthly",
                                          "quirks", "leads", "opportunities", "cogs_monthly", "sm_expense_monthly", "app_events"])
        self.assertEqual((self.truth["seed"], self.truth["company"]), (2202, "ledgerloop"))
        self.assertEqual(self.truth["as_of_date"], "2026-01-01", "design §10: just after the 2024-2025 window")

    def test_clean_tables_have_co_02_columns_then_the_appended_ones(self):
        self.assertEqual(list(ll.CLEAN_TABLES), CO02_TABLES + APPENDED)
        self.assertEqual(set(self.clean), set(COLUMNS))
        for name, cols in COLUMNS.items():
            got = self.rows("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'clean' "
                            "AND table_name = ? ORDER BY ordinal_position", [name])
            self.assertEqual(got, cols, name)

    def test_raw_holds_every_table_with_the_quirks_on_its_copies(self):
        # S8-01: Q-02-01 to -07 on the copies of their tables, unchanged copies of the rest.
        self.assertEqual(set(self.raw), set(COLUMNS))
        self.assertEqual(set(ll_raw.RAW_TABLES), set(COLUMNS))
        for name in set(COLUMNS) - QUIRK_TABLES:
            self.assertTrue(self.raw[name].equals(self.clean[name]), f"raw {name} is an unchanged copy")
        for name in QUIRK_TABLES:
            raw_cols = self.rows("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'raw' "
                                 "AND table_name = ? ORDER BY ordinal_position", [name])
            expected = [(c, TSTZ if (name, c) == ("payments", "attempted_at") else t) for c, t in COLUMNS[name]]
            self.assertEqual(raw_cols, expected, f"raw {name}: the clean columns (Q-02-04: payments in UTC)")

    def test_row_counts_follow_co_02_or_a_declared_s8_04_change(self):
        changes = ll.S8_04_VOLUMES
        self.assertTrue(set(changes) <= S8_04_TABLES, "S8-04 changes only the volume tables 05's prices and mix constrain")
        for name, rows in VOLUMES.items():
            got = self.clean[name].num_rows
            if name in changes:
                target, why = changes[name]["rows"], changes[name]["why"]
                self.assertTrue(isinstance(why, str) and len(why) > 20, f"{name}: S8-04 says why the count changed")
                self.assertTrue(0.9 * target <= got <= 1.1 * target, f"{name}: within 10% of its declared S8-04 count")
            else:
                self.assertTrue(0.9 * rows <= got <= 1.1 * rows, f"{name}: within 10% of CO-02's count")
        self.assertEqual(self.clean["fx_rates"].num_rows, 731 * 3, "every day of the window, for EUR, GBP and CHF")
        self.assertEqual(self.clean["marketing_spend_monthly"].num_rows, 24 * len(PAID_MEDIA))
        self.assertTrue(135_000 <= self.clean["app_events"].num_rows <= 165_000, "S8-06: about 150,000 app events")

    def test_keys_are_unique(self):
        for name, key in KEYS.items():
            rows, distinct, missing = self.one(f"SELECT count(*), count(DISTINCT ({', '.join(key)})), "
                                               f"count(*) - count({key[0]}) FROM clean.{name}")
            self.assertEqual((rows, missing), (distinct, 0), f"{name}: {key} is unique and never missing")
        self.assertEqual(self.one("SELECT count(*) - count(DISTINCT account_name) FROM clean.accounts")[0], 0, "account names unique")

    def test_every_link_meets_a_row(self):
        links = [("subscriptions", "account_id", "accounts", "account_id"), ("subscriptions", "plan_id", "plans", "plan_id"),
                 ("subscription_events", "subscription_id", "subscriptions", "subscription_id"),
                 ("subscription_events", "account_id", "accounts", "account_id"),
                 ("invoices", "subscription_id", "subscriptions", "subscription_id"), ("invoices", "account_id", "accounts", "account_id"),
                 ("payments", "invoice_id", "invoices", "invoice_id"), ("users", "account_id", "accounts", "account_id"),
                 ("usage_weekly", "account_id", "accounts", "account_id"), ("support_tickets", "account_id", "accounts", "account_id"),
                 ("opportunities", "lead_id", "leads", "lead_id"), ("app_events", "user_id", "users", "user_id"),
                 ("app_events", "account_id", "accounts", "account_id")]
        for table, column, ref, ref_column in links:
            orphans = self.one(f"""SELECT count(*) FROM clean.{table} x WHERE x.{column} IS NULL OR NOT EXISTS
                                   (SELECT 1 FROM clean.{ref} r WHERE r.{ref_column} = x.{column})""")[0]
            self.assertEqual(orphans, 0, f"{table}.{column} always meets {ref}.{ref_column}")
        mismatched = self.one("""SELECT count(*) FROM clean.subscription_events e JOIN clean.subscriptions s USING (subscription_id)
                                 WHERE e.account_id <> s.account_id""")[0]
        self.assertEqual(mismatched, 0, "an event's account is its subscription's")
        mismatched = self.one("""SELECT count(*) FROM clean.app_events a JOIN clean.users u USING (user_id) WHERE a.account_id <> u.account_id""")[0]
        self.assertEqual(mismatched, 0, "an app event's account is its user's")

    def test_the_window(self):
        outside = self.one("""SELECT (SELECT count(*) FROM clean.subscription_events WHERE event_date NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-31')
               + (SELECT count(*) FROM clean.invoices WHERE invoice_date NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-31')
               + (SELECT count(*) FROM clean.payments WHERE CAST(attempted_at AS DATE) NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-31')
               + (SELECT count(*) FROM clean.support_tickets WHERE CAST(opened_at AS DATE) NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-31')
               + (SELECT count(*) FROM clean.usage_weekly WHERE week_start NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-29')
               + (SELECT count(*) FROM clean.leads WHERE CAST(created_at AS DATE) NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-31')
               + (SELECT count(*) FROM clean.opportunities WHERE CAST(created_at AS DATE) NOT BETWEEN DATE '2024-01-01' AND DATE '2025-12-31')
               + (SELECT count(*) FROM clean.subscriptions WHERE end_date > DATE '2025-12-31' OR start_date > DATE '2025-12-31')""")[0]
        self.assertEqual(outside, 0, "every dated row falls in 2024-01-01 to 2025-12-31")
        later = self.one("""SELECT (SELECT count(*) FROM clean.support_tickets WHERE resolved_at >= TIMESTAMP '2026-01-01')
                                 + (SELECT count(*) FROM clean.users WHERE invited_at >= TIMESTAMP '2026-01-01' OR deactivated_at >= TIMESTAMP '2026-01-01')
                                 + (SELECT count(*) FROM clean.opportunities WHERE closed_at >= TIMESTAMP '2026-01-01')""")[0]
        self.assertEqual(later, 0, "nothing after as_of_date: a later resolution or close is still missing")
        days, currencies, eur = self.one("""SELECT count(DISTINCT rate_date), list(DISTINCT currency ORDER BY currency),
                                            count(*) FILTER (WHERE currency = 'EUR' AND eur_per_unit <> 1) FROM clean.fx_rates""")
        self.assertEqual((days, currencies, eur), (731, ["CHF", "EUR", "GBP"], 0))
        weeks = self.one("SELECT count(DISTINCT week_start), count(*) FILTER (WHERE dayofweek(week_start) <> 1) FROM clean.usage_weekly")
        self.assertEqual(weeks, (105, 0), "every Monday from 2024-01-01 to 2025-12-29")

    def test_plans_keep_05s_list_prices(self):
        # S8-04: 05's list prices never change: Starter 290 then 349 from 2025-02-01, Growth 890, Scale 2,400, Enterprise custom,
        # the AP Automation add-on 300 a month.
        got = {(n, None if p is None else float(p), f, t) for n, p, f, t in
               self.rows("SELECT plan_name, list_price_eur_month, valid_from, valid_to FROM clean.plans")}
        starter = sorted((p, f, t) for n, p, f, t in got if n == "Starter")
        self.assertEqual([p for p, _, _ in starter], [290.0, 349.0])
        self.assertEqual((starter[0][2], starter[1][1], starter[1][2]), (dt.date(2025, 1, 31), dt.date(2025, 2, 1), None))
        prices = {n: p for n, p, _, t in got if t is None}
        self.assertEqual(prices, {"Starter": 349.0, "Growth": 890.0, "Scale": 2400.0, "Enterprise": None, "AP Automation": 300.0})
        used = {r[0] for r in self.rows("SELECT DISTINCT p.plan_name FROM clean.subscriptions s JOIN clean.plans p USING (plan_id)")}
        self.assertEqual(used, {"Starter", "Growth", "Scale", "Enterprise"}, "the add-on is part of a subscription's MRR")

    def test_one_currency_per_subscription_by_country(self):
        bad = self.one("""SELECT count(*) FROM clean.subscriptions s JOIN clean.accounts a USING (account_id)
                          WHERE s.currency <> CASE a.country_code WHEN 'GB' THEN 'GBP' WHEN 'CH' THEN 'CHF' ELSE 'EUR' END""")[0]
        self.assertEqual(bad, 0, "GB bills in GBP, CH in CHF, every other country in EUR")
        bad = self.one("""SELECT count(*) FROM clean.invoices i JOIN clean.subscriptions s USING (subscription_id)
                          WHERE i.currency <> s.currency OR i.account_id <> s.account_id""")[0]
        self.assertEqual(bad, 0, "an invoice is in its subscription's currency")
        overlap = self.one("""SELECT count(*) FROM clean.subscriptions a JOIN clean.subscriptions b ON a.account_id = b.account_id
                              AND a.subscription_id < b.subscription_id AND b.start_date < coalesce(a.end_date, DATE '9999-12-31')
                              AND a.start_date < coalesce(b.end_date, DATE '9999-12-31')""")[0]
        self.assertEqual(overlap, 0, "an account holds one subscription at a time")

    def test_no_clean_account_looks_like_a_test_account(self):
        self.assertEqual(self.one("SELECT count(*) FROM clean.accounts WHERE is_test OR account_name ILIKE '%test%'")[0], 0)
        self.assertEqual({r[0] for r in self.rows("SELECT DISTINCT segment FROM clean.accounts")}, {"SMB", "Mid-Market", "Enterprise"})


class Mrr(Fixture):
    """S8-02 (one MRR source), S8-03 (legacy accounts) and Review Focus 2: the MRR reconciles for every month and subscription."""

    def test_events_sum_to_the_mrr_in_force_of_every_subscription_at_each_month_end(self):
        wrong = self.one("""SELECT count(*) FROM clean.in_force
            WHERE (mrr > 0) <> (start_date <= month_end AND (end_date IS NULL OR end_date > month_end)) OR mrr < 0""")[0]
        self.assertEqual(wrong, 0, "a subscription has MRR at a month end exactly when it is active then")
        running = self.one("""SELECT count(*) FROM clean.subscriptions s
            JOIN (SELECT subscription_id, sum(mrr_delta_local) AS total, sum(mrr_delta_local) FILTER (WHERE event_type <> 'churn') AS before_end
                  FROM clean.subscription_events GROUP BY 1) e USING (subscription_id)
            WHERE (s.end_date IS NULL AND e.total <> s.mrr_local) OR (s.end_date IS NOT NULL AND (e.total <> 0 OR e.before_end <> s.mrr_local))""")[0]
        self.assertEqual(running, 0, "mrr_local is the MRR at the end, or at as_of_date for a running subscription")
        negative = self.one("""SELECT count(*) FROM (SELECT subscription_id, sum(mrr_delta_local) OVER (PARTITION BY subscription_id
                                   ORDER BY event_date, event_id) AS running FROM clean.subscription_events) WHERE running < 0""")[0]
        self.assertEqual(negative, 0, "the running MRR never goes below zero")

    def test_monthly_invoices_bill_the_mrr_in_force(self):
        # An independent source: a monthly plan's invoice on a renewal bills the MRR in force that day, to the cent.
        bad, n = self.one("""SELECT count(*) FILTER (WHERE i.amount_local <> (SELECT sum(e.mrr_delta_local) FROM clean.subscription_events e
                                                                         WHERE e.subscription_id = i.subscription_id AND e.event_date <= i.invoice_date)),
                                    count(*)
                             FROM clean.invoices i JOIN clean.subscriptions s USING (subscription_id) WHERE s.billing_period = 'monthly'""")
        self.assertGreater(n, 10_000)
        self.assertEqual(bad, 0, "every monthly invoice is the MRR in force on its date")
        bad = self.one("""SELECT count(*) FROM clean.invoices i JOIN clean.subscriptions s USING (subscription_id)
            WHERE s.billing_period = 'annual' AND i.invoice_date = s.start_date
              AND i.amount_local <> 12 * (SELECT sum(e.mrr_delta_local) FROM clean.subscription_events e
                                          WHERE e.subscription_id = i.subscription_id AND e.event_date <= i.invoice_date)""")[0]
        self.assertEqual(bad, 0, "an annual plan's first invoice is twelve months of its MRR")

    def test_every_month_reconciles_to_the_cent(self):
        # Review Focus 2: opening MRR plus new, expansion and reactivation, less contraction and churn, is closing MRR, per currency.
        rows = self.rows("""WITH m AS (SELECT month_start, month_end FROM clean.month_ends),
            c AS (SELECT DISTINCT currency FROM clean.subscriptions),
            closing AS (SELECT m.month_end, c.currency, (SELECT coalesce(sum(f.mrr), 0) FROM clean.in_force f
                                                          WHERE f.month_end = m.month_end AND f.currency = c.currency) AS mrr FROM m, c),
            moves AS (SELECT m.month_end, s.currency, e.event_type, sum(e.mrr_delta_local) AS amount
                      FROM clean.subscription_events e JOIN clean.subscriptions s USING (subscription_id)
                      JOIN m ON e.event_date BETWEEN m.month_start AND m.month_end GROUP BY ALL)
            SELECT cl.month_end, cl.currency, cl.mrr,
                   coalesce(lag(cl.mrr) OVER (PARTITION BY cl.currency ORDER BY cl.month_end),
                            (SELECT sum(e.mrr_delta_local) FROM clean.subscription_events e JOIN clean.subscriptions s USING (subscription_id)
                             WHERE e.event_type = 'opening' AND s.currency = cl.currency)) AS opening,
                   coalesce(sum(mv.amount) FILTER (WHERE mv.event_type IN ('new', 'expansion', 'reactivation')), 0) AS ups,
                   coalesce(sum(mv.amount) FILTER (WHERE mv.event_type IN ('contraction', 'churn')), 0) AS downs,
                   coalesce(sum(mv.amount) FILTER (WHERE mv.event_type = 'opening' AND cl.month_end > DATE '2024-01-31'), 0) AS stray
            FROM closing cl LEFT JOIN moves mv ON mv.month_end = cl.month_end AND mv.currency = cl.currency GROUP BY cl.month_end, cl.currency, cl.mrr""")
        self.assertEqual(len(rows), 24 * 3)
        for month_end, currency, closing, opening, ups, downs, stray in rows:
            self.assertTrue(opening + ups + downs == closing, f"{currency} {month_end}: opening plus movements is closing")
            self.assertTrue(stray == 0, "movement queries leave opening events out: they are all in January 2024")

    def test_opening_events(self):
        # S8-02, E-015: one opening event on 2024-01-01 for each subscription active that day; together EUR 0.85M to 0.95M MRR.
        active, opened, wrong_day, dupes = self.one("""SELECT
                (SELECT count(*) FROM clean.subscriptions WHERE start_date <= DATE '2024-01-01' AND (end_date IS NULL OR end_date > DATE '2024-01-01')),
                (SELECT count(DISTINCT subscription_id) FROM clean.subscription_events WHERE event_type = 'opening'),
                (SELECT count(*) FROM clean.subscription_events WHERE event_type = 'opening' AND event_date <> DATE '2024-01-01'),
                (SELECT count(*) - count(DISTINCT subscription_id) FROM clean.subscription_events WHERE event_type = 'opening')""")
        self.assertEqual((opened, wrong_day, dupes), (active, 0, 0))
        not_before = self.one("""SELECT count(*) FROM clean.subscription_events e JOIN clean.subscriptions s USING (subscription_id)
                                 WHERE e.event_type = 'opening' AND s.start_date >= DATE '2024-01-01'""")[0]
        self.assertEqual(not_before, 0, "only a subscription started before the window opens with a balance")
        first_day_new = self.one("SELECT count(*) FROM clean.subscription_events WHERE event_type = 'new' AND event_date = DATE '2024-01-01'")[0]
        self.assertEqual(first_day_new, 0, "S8-02: no account is won on 2024-01-01, so MRR that day is the opening events' sum")
        eur = self.one("""SELECT sum(e.mrr_delta_local * fx.eur_per_unit) FROM clean.subscription_events e
                          JOIN clean.subscriptions s USING (subscription_id)
                          JOIN clean.fx_rates fx ON fx.rate_date = DATE '2024-01-01' AND fx.currency = s.currency
                          WHERE e.event_type = 'opening'""")[0]
        self.band(eur, 850_000, 950_000, "S8-02: the opening events' EUR MRR")
        self.close(self.truth["planted"]["opening_mrr_eur"], eur, 0.01, "opening MRR")

    def test_event_types_signs_and_first_events(self):
        self.assertEqual({r[0] for r in self.rows("SELECT DISTINCT event_type FROM clean.subscription_events")}, EVENT_TYPES)
        signs = self.one("""SELECT count(*) FILTER (WHERE event_type IN ('opening', 'new', 'expansion', 'reactivation') AND mrr_delta_local <= 0)
                                 + count(*) FILTER (WHERE event_type IN ('contraction', 'churn') AND mrr_delta_local >= 0)
                            FROM clean.subscription_events""")[0]
        self.assertEqual(signs, 0, "ups are positive, downs negative")
        firsts = self.one("""WITH r AS (SELECT *, row_number() OVER (PARTITION BY subscription_id ORDER BY event_date, event_id) AS k
                                        FROM clean.subscription_events)
            SELECT count(*) FILTER (WHERE k = 1 AND event_type NOT IN ('opening', 'new', 'reactivation'))
                 + count(*) FILTER (WHERE k > 1 AND event_type IN ('opening', 'new', 'reactivation')) FROM r""")[0]
        self.assertEqual(firsts, 0, "a subscription starts with one opening, new or reactivation event, and only then")
        starts = self.one("""SELECT count(*) FROM clean.subscriptions s JOIN clean.subscription_events e USING (subscription_id)
                             WHERE e.event_type IN ('new', 'reactivation') AND e.event_date <> s.start_date""")[0]
        self.assertEqual(starts, 0, "a new or reactivation event is dated its subscription's start")
        ends = self.one("""SELECT count(*) FROM clean.subscriptions s LEFT JOIN clean.subscription_events e
                           ON e.subscription_id = s.subscription_id AND e.event_type = 'churn'
                           WHERE (s.end_date IS NULL) <> (e.event_id IS NULL) OR e.event_date <> s.end_date""")[0]
        self.assertEqual(ends, 0, "a subscription ends exactly on its one churn event")
        unique = self.one("""SELECT count(*) FROM (SELECT subscription_id, event_type, event_date, mrr_delta_local FROM clean.subscription_events
                             GROUP BY ALL HAVING count(*) > 1)""")[0]
        self.assertEqual(unique, 0, "clean has no two events with the same business key (FIND-02-13 finds raw's)")

    def test_legacy_accounts_never_look_new(self):
        # S8-03, E-089: an account created before 2024 keeps that created_at and has only an opening event at the window's start.
        legacy_new, legacy_without_opening = self.one("""SELECT
                (SELECT count(*) FROM clean.subscription_events e JOIN clean.accounts a USING (account_id)
                 WHERE e.event_type = 'new' AND a.created_at < TIMESTAMP '2024-01-01'),
                (SELECT count(*) FROM clean.accounts a WHERE a.created_at < TIMESTAMP '2024-01-01' AND NOT EXISTS
                    (SELECT 1 FROM clean.subscription_events e WHERE e.account_id = a.account_id AND e.event_type = 'opening'))""")
        self.assertEqual((legacy_new, legacy_without_opening), (0, 0))
        window_opening = self.one("""SELECT count(*) FROM clean.subscription_events e JOIN clean.accounts a USING (account_id)
                                     WHERE e.event_type = 'opening' AND a.created_at >= TIMESTAMP '2024-01-01'""")[0]
        self.assertEqual(window_opening, 0)
        new_accounts = self.one("""SELECT count(*) FROM clean.accounts a WHERE a.created_at >= TIMESTAMP '2024-01-01' AND
            (SELECT count(*) FROM clean.subscription_events e WHERE e.account_id = a.account_id AND e.event_type = 'new') <> 1""")[0]
        self.assertEqual(new_accounts, 0, "each account created in the window has exactly one new event")
        dated = self.one("""SELECT count(*) FROM clean.subscription_events e JOIN clean.accounts a USING (account_id)
                            WHERE e.event_type = 'new' AND e.event_date <> CAST(a.created_at AS DATE)""")[0]
        self.assertEqual(dated, 0, "the new event is on the account's created day")
        cohort_2024 = self.one("""SELECT count(*) FROM clean.accounts WHERE created_at >= TIMESTAMP '2024-01-01'
                                  AND account_id IN (SELECT account_id FROM clean.subscription_events WHERE event_type = 'opening')""")[0]
        self.assertEqual(cohort_2024, 0, "a cohort by created_at month never puts a legacy account in 2024")

    def test_contraction_and_reactivation(self):
        contractions, reactivations = self.one("""SELECT count(*) FILTER (WHERE event_type = 'contraction'),
                                                         count(*) FILTER (WHERE event_type = 'reactivation') FROM clean.subscription_events""")
        self.assertTrue(contractions >= 150, "S8-02: at least 150 contraction events")
        self.assertTrue(reactivations >= 60, "S8-02: at least 60 reactivation events")
        bad = self.one("""SELECT count(*) FROM clean.subscription_events e JOIN clean.subscriptions s USING (subscription_id)
            WHERE e.event_type = 'reactivation' AND NOT EXISTS (SELECT 1 FROM clean.subscriptions p WHERE p.account_id = s.account_id
                                                               AND p.end_date IS NOT NULL AND p.end_date <= s.start_date)""")[0]
        self.assertEqual(bad, 0, "a reactivation is a churned account's later subscription")
        returning_new = self.one("""SELECT count(*) FROM clean.subscription_events e JOIN clean.subscriptions s USING (subscription_id)
            WHERE e.event_type = 'new' AND EXISTS (SELECT 1 FROM clean.subscriptions p WHERE p.account_id = s.account_id
                                                   AND p.start_date < s.start_date)""")[0]
        self.assertEqual(returning_new, 0, "a returning account is never typed new")

    def test_annual_plans_bill_the_year_with_15_percent_off_and_churn_only_on_a_renewal(self):
        # S8-02 (E-104): an annual plan's MRR is the year's price, 15% off, over 12; it churns only on a renewal date. Every price is
        # in whole currency units a month, so an annual plan's MRR in cents times 100 / 85 is whole units too.
        off_price = self.one("""SELECT count(*) FROM clean.subscription_events e JOIN clean.subscriptions s USING (subscription_id)
            WHERE s.billing_period = 'annual' AND e.event_type IN ('new', 'reactivation', 'opening')
              AND (CAST(round(e.mrr_delta_local * 100) AS BIGINT) * 100 % 85 <> 0
                   OR CAST(round(e.mrr_delta_local * 100) AS BIGINT) * 100 / 85 % 100 <> 0)""")[0]
        self.assertEqual(off_price, 0, "an annual plan's MRR is 85% of a whole monthly price")
        starts = {int(round(float(r[0]) * 100)) for r in self.rows("""SELECT DISTINCT e.mrr_delta_local FROM clean.subscription_events e
            JOIN clean.subscriptions s USING (subscription_id) WHERE s.billing_period = 'annual' AND s.currency = 'EUR' AND e.event_type = 'new'""")}
        self.assertTrue({24650, 29665, 75650} <= starts, "annual Starter (290 and 349) and Growth start at 12 x price x 0.85 / 12")
        off = self.one("""SELECT count(*) FROM clean.subscriptions WHERE billing_period = 'annual' AND end_date IS NOT NULL
                          AND (date_diff('month', start_date, end_date) % 12 <> 0 OR day(end_date) <> least(day(start_date), day(last_day(end_date))))""")[0]
        self.assertEqual(off, 0, "an annual plan ends only on an anniversary of its start")
        self.assertIn("annual", {r[0] for r in self.rows("SELECT DISTINCT billing_period FROM clean.subscriptions")})

    def test_the_starter_price_rise_applies_at_renewal_from_february_2025(self):
        rises = self.one("""SELECT count(*) FROM clean.subscription_events e JOIN clean.subscriptions s USING (subscription_id)
            JOIN clean.plans p USING (plan_id)
            WHERE e.event_type = 'expansion' AND e.event_date >= DATE '2025-02-01' AND p.plan_name = 'Starter' AND s.currency = 'EUR'
              AND e.mrr_delta_local IN (59.00, 50.15)""")[0]
        self.assertTrue(rises > 100, "Starter subscriptions move from 290 to 349 at a renewal from 2025-02-01")
        early = self.one("""SELECT count(*) FROM clean.subscriptions s JOIN clean.plans p USING (plan_id)
                            WHERE p.list_price_eur_month = 349 AND s.start_date < DATE '2025-02-01' AND s.end_date < DATE '2025-02-01'""")[0]
        self.assertEqual(early, 0, "no subscription that ended before February 2025 is on the 349 price")


class Findings(Fixture):
    """One test per finding of 05 CO-02, each with 05 §5's validation band."""

    ACTIVE_END = """SELECT s.*, p.plan_name, fx.eur_per_unit FROM clean.subscriptions s JOIN clean.plans p USING (plan_id)
                    JOIN clean.fx_rates fx ON fx.rate_date = DATE '2025-12-31' AND fx.currency = s.currency
                    WHERE s.start_date <= DATE '2025-12-31' AND (s.end_date IS NULL OR s.end_date > DATE '2025-12-31')"""

    def test_find_02_01_scale_and_enterprise_hold_a_fifth_of_logos_and_most_of_mrr(self):
        logos, mrr = self.one(f"""WITH a AS ({self.ACTIVE_END})
            SELECT avg(CASE WHEN plan_name IN ('Scale', 'Enterprise') THEN 1 ELSE 0 END),
                   sum(mrr_local * eur_per_unit) FILTER (WHERE plan_name IN ('Scale', 'Enterprise')) / sum(mrr_local * eur_per_unit) FROM a""")
        self.band(logos, 0.15, 0.25, "FIND-02-01 logo share")
        self.band(mrr, 0.5, 0.7, "FIND-02-01 MRR share")
        f = self.found("FIND-02-01")
        self.close(f["logo_share"], logos, 1e-3, "FIND-02-01")
        self.close(f["mrr_share"], mrr, 1e-3, "FIND-02-01")

    def test_find_02_02_de_has_most_accounts_and_only_gb_and_ch_bill_outside_eur(self):
        top = self.one("SELECT country_code FROM clean.accounts GROUP BY 1 ORDER BY count(*) DESC LIMIT 1")[0]
        self.assertTrue(top == "DE", "FIND-02-02: DE has the most accounts")
        pairs = {(c, k) for c, k in self.rows("""SELECT DISTINCT a.country_code, s.currency FROM clean.accounts a
                                                 JOIN clean.subscriptions s USING (account_id)""")}
        self.assertTrue({k for _, k in pairs} == {"EUR", "GBP", "CHF"}, "FIND-02-02: three currencies")
        self.assertTrue({c for c, k in pairs if k != "EUR"} == {"GB", "CH"}, "FIND-02-02: only GB and CH bill outside EUR")
        self.assertTrue(self.found("FIND-02-02")["top_country"] == "DE", "FIND-02-02: the truth file records the top country")

    def month_end_eur(self):
        return dict(self.rows("""SELECT m.month_end, sum(f.mrr * fx.eur_per_unit) FROM clean.month_ends m
            JOIN clean.in_force f USING (month_end) JOIN clean.fx_rates fx ON fx.rate_date = m.month_end AND fx.currency = f.currency
            GROUP BY 1"""))

    def test_find_02_03_mrr_grows_from_about_0_9_to_about_1_6_million(self):
        mrr = self.month_end_eur()
        ratio = float(mrr[dt.date(2025, 12, 31)] / mrr[dt.date(2024, 1, 31)])
        self.band(ratio, 1.6, 1.9, "FIND-02-03 Dec 2025 over Jan 2024")
        self.close(self.found("FIND-02-03")["ratio"], ratio, 1e-3, "FIND-02-03")

    def test_find_02_04_churn_mrr_peaks_in_march_2025(self):
        top = self.one("""SELECT strftime(e.event_date, '%Y-%m') FROM clean.subscription_events e JOIN clean.subscriptions s USING (subscription_id)
            JOIN clean.fx_rates fx ON fx.rate_date = e.event_date AND fx.currency = s.currency
            WHERE e.event_type = 'churn' GROUP BY 1 ORDER BY -sum(e.mrr_delta_local * fx.eur_per_unit) DESC LIMIT 1""")[0]
        self.assertTrue(top == "2025-03", "FIND-02-04: the month with the most churned MRR")
        self.assertTrue(self.found("FIND-02-04")["peak_month"] == top, "FIND-02-04: the truth file records the peak month")

    def churn_rates(self, where):
        """Monthly logo churn: subscriptions active on the month's first day that end in the month, over those active then."""
        return dict(self.rows(f"""SELECT m.month_start, count(*) FILTER (WHERE s.end_date <= m.month_end) / count(*)
            FROM clean.month_ends m JOIN clean.subscriptions s ON s.start_date <= m.month_start AND (s.end_date IS NULL OR s.end_date > m.month_start)
            JOIN clean.accounts a USING (account_id) JOIN clean.plans p USING (plan_id) WHERE {where} GROUP BY 1"""))

    def test_find_02_05_the_starter_price_rise_doubles_smb_starter_churn_and_leaves_mid_market_alone(self):
        def ratio(rates):
            spike = [rates[dt.date(2025, k, 1)] for k in (2, 3, 4, 5)]
            base = [rates[dt.date(2024, k, 1)] for k in range(1, 13)]
            return (sum(spike) / 4) / (sum(base) / 12)
        smb = ratio(self.churn_rates("a.segment = 'SMB' AND p.plan_name = 'Starter'"))
        mm = ratio(self.churn_rates("a.segment = 'Mid-Market'"))
        self.band(smb, 1.7, 2.4, "FIND-02-05 SMB Starter ratio")
        self.band(mm, 0.8, 1.2, "FIND-02-05 mid-market ratio")
        f = self.found("FIND-02-05")
        self.close(f["smb_starter_ratio"], smb, 1e-3, "FIND-02-05")
        self.close(f["mid_market_ratio"], mm, 1e-3, "FIND-02-05")

    def cohort(self, where_accounts="TRUE"):
        """Accounts active on 2025-01-01 and their MRR then and on 2025-12-31, both in EUR at 2025-12-31's rate."""
        return f"""WITH s AS ({ACCOUNT_MRR_SQL.format(d='2025-01-01')}), e AS ({ACCOUNT_MRR_SQL.format(d='2025-12-31')})
            SELECT s.account_id, s.mrr * fx.eur_per_unit AS start_eur, coalesce(e.mrr, 0) * fx.eur_per_unit AS end_eur
            FROM s LEFT JOIN e USING (account_id) JOIN clean.fx_rates fx ON fx.rate_date = DATE '2025-12-31' AND fx.currency = s.currency
            JOIN clean.accounts a ON a.account_id = s.account_id WHERE s.mrr > 0 AND {where_accounts}"""

    def test_find_02_06_logo_churn_beats_revenue_churn_with_grr_about_88_and_nrr_about_104(self):
        grr, nrr, logo = self.one(f"""WITH c AS ({self.cohort()})
            SELECT sum(least(end_eur, start_eur)) / sum(start_eur), sum(end_eur) / sum(start_eur), avg(CASE WHEN end_eur = 0 THEN 1 ELSE 0 END) FROM c""")
        self.band(grr, 0.86, 0.90, "FIND-02-06 GRR")
        self.band(nrr, 1.02, 1.06, "FIND-02-06 NRR")
        self.assertTrue(float(logo) > 1 - float(grr), "FIND-02-06: logo churn is above gross revenue churn")
        f = self.found("FIND-02-06")
        self.close(f["grr"], grr, 1e-3, "FIND-02-06")
        self.close(f["nrr"], nrr, 1e-3, "FIND-02-06")

    def test_find_02_07_monthly_cohorts_lose_about_10_percent_by_month_3_and_annual_ones_spike_at_month_12(self):
        m3 = self.one("""SELECT avg(CASE WHEN s.end_date IS NULL OR s.end_date > s.start_date + INTERVAL 3 MONTH THEN 1 ELSE 0 END)
            FROM clean.subscriptions s JOIN clean.subscription_events e USING (subscription_id)
            WHERE e.event_type = 'new' AND s.billing_period = 'monthly' AND s.start_date <= DATE '2025-09-30'""")[0]
        self.band(m3, 0.87, 0.93, "FIND-02-07 month-3 retention")
        m12 = self.one("""SELECT avg(CASE WHEN s.end_date = CAST(s.start_date + INTERVAL 12 MONTH AS DATE) THEN 1 ELSE 0 END)
            FROM clean.subscriptions s JOIN clean.subscription_events e USING (subscription_id)
            WHERE e.event_type = 'new' AND s.billing_period = 'annual' AND s.start_date <= DATE '2024-12-31'""")[0]
        monthly = sum(self.churn_rates("TRUE").values()) / 24
        self.assertTrue(float(m12) > 3 * float(monthly), "FIND-02-07: month-12 churn of annual cohorts is above 3x the monthly churn")
        f = self.found("FIND-02-07")
        self.close(f["month_3_retention"], m3, 1e-3, "FIND-02-07")

    def test_find_02_08_about_18_percent_of_churn_follows_three_failed_payments(self):
        share = self.one("""SELECT avg(CASE WHEN EXISTS (
                SELECT 1 FROM clean.invoices i JOIN clean.payments p USING (invoice_id)
                WHERE i.subscription_id = e.subscription_id AND NOT p.succeeded
                  AND p.attempted_at >= e.event_date - INTERVAL 30 DAY AND p.attempted_at < e.event_date + INTERVAL 1 DAY
                GROUP BY i.invoice_id HAVING count(*) >= 3) THEN 1 ELSE 0 END)
            FROM clean.subscription_events e WHERE e.event_type = 'churn'""")[0]
        self.band(share, 0.15, 0.21, "FIND-02-08 involuntary share")
        self.close(self.found("FIND-02-08")["involuntary_share"], share, 1e-3, "FIND-02-08")

    def test_find_02_09_a_halving_of_active_users_over_8_weeks_flags_churn_within_90_days(self):
        flagged, unflagged = self.one("""WITH u AS (SELECT account_id, week_start, active_users,
                    lag(active_users, 8) OVER (PARTITION BY account_id ORDER BY week_start) AS lag8 FROM clean.usage_weekly),
                f AS (SELECT u.*, lag8 > 0 AND active_users < 0.5 * lag8 AS flag,
                             EXISTS (SELECT 1 FROM clean.subscription_events e WHERE e.account_id = u.account_id AND e.event_type = 'churn'
                                     AND e.event_date > u.week_start AND e.event_date <= u.week_start + 90) AS churned
                      FROM u WHERE lag8 IS NOT NULL AND week_start <= DATE '2025-09-29')
            SELECT avg(CASE WHEN churned THEN 1 ELSE 0 END) FILTER (WHERE flag), avg(CASE WHEN churned THEN 1 ELSE 0 END) FILTER (WHERE NOT flag) FROM f""")
        self.assertTrue(float(flagged) / float(unflagged) >= 4, "FIND-02-09: flagged accounts churn at 4x or more")
        self.close(self.found("FIND-02-09")["ratio"], float(flagged) / float(unflagged), 1e-2, "FIND-02-09")

    def test_find_02_10_ap_automation_adopters_keep_and_grow_revenue_far_better(self):
        adopter = """EXISTS (SELECT 1 FROM clean.usage_weekly w WHERE w.account_id = a.account_id AND w.ap_module_events > 0
                             AND w.week_start < CAST(a.created_at AS DATE) + 90)"""
        got = dict(self.rows(f"""WITH c AS ({self.cohort("a.created_at >= TIMESTAMP '2024-01-01'")}),
                f AS (SELECT c.*, {adopter} AS adopter FROM c JOIN clean.accounts a USING (account_id))
            SELECT adopter, sum(end_eur) / sum(start_eur) FROM f GROUP BY 1"""))
        self.assertTrue(float(got[True]) - float(got[False]) >= 0.15, "FIND-02-10: the adopters' NRR is 15 points or more higher")
        self.close(self.found("FIND-02-10")["gap"], float(got[True]) - float(got[False]), 1e-3, "FIND-02-10")

    def test_find_02_11_a_naive_sum_of_local_mrr_is_off_by_about_3_percent(self):
        naive, converted = self.one(f"WITH a AS ({self.ACTIVE_END}) SELECT sum(mrr_local), sum(mrr_local * eur_per_unit) FROM a")
        gap = abs(float(naive) / float(converted) - 1)
        self.band(gap, 0.02, 0.04, "FIND-02-11 gap")
        self.close(self.found("FIND-02-11")["gap"], gap, 1e-4, "FIND-02-11")

    def test_find_02_12_reported_mrr_differs_from_restated_mrr_at_six_or_more_month_ends_on_raw(self):
        def differing(schema):
            return self.one(f"""SELECT count(*) FROM (SELECT m.month_end,
                    sum(e.mrr_delta_local) FILTER (WHERE e.event_date <= m.month_end) AS restated,
                    sum(e.mrr_delta_local) FILTER (WHERE e.event_date <= m.month_end AND e.recorded_at < m.month_end + INTERVAL 1 DAY) AS reported
                FROM {schema}.month_ends m CROSS JOIN {schema}.subscription_events e GROUP BY 1) WHERE restated <> reported""")[0]
        self.assertTrue(differing("raw") >= 6, "FIND-02-12: late churn records")
        self.assertTrue(differing("clean") == 0, "clean records every event on its day (Q-02-02 is raw's)")
        self.assertTrue(self.found("FIND-02-12")["month_ends_differing"] == differing("raw"), "FIND-02-12: the truth file records it")

    def test_find_02_13_about_210_duplicate_events_inflate_expansion(self):
        dupes, expansion = self.one("""SELECT sum(n - 1), sum(n - 1) FILTER (WHERE event_type = 'expansion') FROM (
            SELECT event_type, count(*) AS n FROM raw.subscription_events GROUP BY subscription_id, event_type, event_date, mrr_delta_local
            HAVING count(*) > 1)""")
        self.assertTrue(180 <= dupes <= 240, "FIND-02-13: 180 to 240 duplicate events on raw")
        self.assertTrue(expansion > dupes / 2, "most duplicates are expansion events")
        self.assertTrue(self.found("FIND-02-13")["duplicates"] == dupes, "FIND-02-13: the truth file records the duplicates")

    def test_find_02_14_p1_resolution_slows_in_q3_2025_and_p1_heavy_accounts_churn_more(self):
        q2, q3 = self.one("""SELECT median(date_diff('minute', opened_at, resolved_at)) FILTER (WHERE opened_at >= TIMESTAMP '2025-04-01' AND opened_at < TIMESTAMP '2025-07-01'),
                                    median(date_diff('minute', opened_at, resolved_at)) FILTER (WHERE opened_at >= TIMESTAMP '2025-07-01' AND opened_at < TIMESTAMP '2025-10-01')
                             FROM clean.support_tickets WHERE priority = 'P1'""")
        self.assertTrue(float(q3) / float(q2) >= 1.5, "FIND-02-14: Q3 2025 P1 median over Q2's")
        self.assertGreater(self.one("SELECT count(*) FROM clean.support_tickets WHERE resolved_at IS NULL")[0], 0, "unresolved tickets stay missing")
        high, other = self.one("""WITH q AS (SELECT CAST(range AS DATE) AS q_start, CAST(range + INTERVAL 3 MONTH AS DATE) AS q_next
                                             FROM range(DATE '2024-01-01', DATE '2025-10-01', INTERVAL 3 MONTH)),
                act AS (SELECT q.q_start, q.q_next, s.account_id FROM q JOIN clean.subscriptions s
                        ON s.start_date < q.q_next AND (s.end_date IS NULL OR s.end_date >= q.q_next) GROUP BY ALL),
                f AS (SELECT act.*, (SELECT count(*) FROM clean.support_tickets t WHERE t.account_id = act.account_id AND t.priority = 'P1'
                                     AND t.opened_at >= act.q_start AND t.opened_at < act.q_next) >= 3 AS heavy,
                             EXISTS (SELECT 1 FROM clean.subscription_events e WHERE e.account_id = act.account_id AND e.event_type = 'churn'
                                     AND e.event_date >= act.q_next AND e.event_date < act.q_next + INTERVAL 3 MONTH) AS churned FROM act)
            SELECT avg(CASE WHEN churned THEN 1 ELSE 0 END) FILTER (WHERE heavy), avg(CASE WHEN churned THEN 1 ELSE 0 END) FILTER (WHERE NOT heavy) FROM f""")
        self.assertTrue(float(high) / float(other) >= 2.5, "FIND-02-14: P1-heavy account-quarters churn at 2.5x or more")
        f = self.found("FIND-02-14")
        self.close(f["p1_median_ratio"], float(q3) / float(q2), 1e-3, "FIND-02-14")
        self.close(f["churn_ratio"], float(high) / float(other), 1e-3, "FIND-02-14")

    def test_find_02_15_cac_payback_about_7_months_for_partners_and_20_for_paid_search(self):
        gm = self.one("""SELECT 1 - (SELECT sum(amount_eur) FROM clean.cogs_monthly) / sum(f.mrr * fx.eur_per_unit) FROM clean.in_force f
                         JOIN clean.fx_rates fx ON fx.rate_date = f.month_end AND fx.currency = f.currency""")[0]
        payback = dict(self.rows(f"""WITH n AS (SELECT a.acquisition_channel AS channel, count(*) AS logos,
                                                      avg(e.mrr_delta_local * fx.eur_per_unit) AS new_mrr
                    FROM clean.accounts a JOIN clean.subscription_events e ON e.account_id = a.account_id AND e.event_type = 'new'
                    JOIN clean.subscriptions s USING (subscription_id)
                    JOIN clean.fx_rates fx ON fx.rate_date = e.event_date AND fx.currency = s.currency GROUP BY 1),
                cost AS (SELECT channel, sum(amount) AS cost FROM (
                    SELECT channel, spend_eur AS amount FROM clean.marketing_spend_monthly
                    UNION ALL SELECT channel, amount_eur FROM clean.sm_expense_monthly) GROUP BY 1)
            SELECT n.channel, (cost.cost / n.logos) / (n.new_mrr * {gm}) FROM n JOIN cost USING (channel)
            WHERE n.channel IN ('partner', 'paid_search')"""))
        self.band(payback["partner"], 5, 9, "FIND-02-15 partner payback months")
        self.band(payback["paid_search"], 17, 23, "FIND-02-15 paid search payback months")
        f = self.found("FIND-02-15")
        self.close(f["payback_months"]["partner"], payback["partner"], 1e-2, "FIND-02-15")
        self.close(f["payback_months"]["paid_search"], payback["paid_search"], 1e-2, "FIND-02-15")

    def test_the_truth_records_all_15_findings_with_definitions(self):
        names = [f"FIND-02-{i:02d}" for i in range(1, 16)]
        self.assertTrue(set(names) <= set(self.truth["findings"]))
        self.assertTrue(all(self.truth["findings"][n]["pass"] is True for n in names))
        self.assertTrue(set(names) <= set(self.truth["definitions"]))
        self.assertTrue(set(ll.S8_04_VOLUMES) <= set(self.truth["s8_04"]), "the truth file records each S8-04 change")
        json.dumps(self.truth)


class Quirks(Fixture):
    """GEN-04 and GEN-06: each quirk Q-02-01 to -07 exists in raw and not in clean, with the count the truth records."""

    def planted(self, quirk):
        return self.truth["planted"]["raw"][quirk]

    def test_q02_01_webhook_retries_duplicate_events_under_new_ids(self):
        extra = self.raw["subscription_events"].num_rows - self.clean["subscription_events"].num_rows
        self.assertTrue(extra == self.planted("Q-02-01")["count"], "Q-02-01: the truth's count")
        first_new = self.one("""SELECT min(event_id) FROM raw.subscription_events WHERE event_id NOT IN (SELECT event_id FROM clean.subscription_events)""")[0]
        self.assertGreater(first_new, self.one("SELECT max(event_id) FROM clean.subscription_events")[0], "appended under new event_ids")
        later = self.one("""SELECT count(*) FROM raw.subscription_events r WHERE r.event_id > (SELECT max(event_id) FROM clean.subscription_events)
            AND NOT EXISTS (SELECT 1 FROM clean.subscription_events c WHERE (c.subscription_id, c.event_type, c.event_date, c.mrr_delta_local)
                            = (r.subscription_id, r.event_type, r.event_date, r.mrr_delta_local) AND r.recorded_at > c.recorded_at
                            AND r.recorded_at <= c.recorded_at + INTERVAL 1 HOUR)""")[0]
        self.assertEqual(later, 0, "each duplicate repeats a clean event, recorded up to an hour after it")
        kept = self.one("""SELECT count(*) FROM clean.subscription_events c LEFT JOIN raw.subscription_events r USING (event_id)
                           WHERE r.event_id IS NULL OR (c.subscription_id, c.event_type, c.event_date, c.mrr_delta_local)
                                 IS DISTINCT FROM (r.subscription_id, r.event_type, r.event_date, r.mrr_delta_local)""")[0]
        self.assertEqual(kept, 0, "every clean event is in raw under its own ID")

    def test_q02_02_six_percent_of_churn_events_are_recorded_over_30_days_late(self):
        late, churns = self.one("""SELECT count(*) FILTER (WHERE recorded_at > event_date + INTERVAL 31 DAY), count(*)
                                   FROM raw.subscription_events WHERE event_type = 'churn'
                                   AND event_id <= (SELECT max(event_id) FROM clean.subscription_events)""")
        self.assertTrue(0.05 <= late / churns <= 0.07, "about 6% of churn events recorded more than 30 days late")
        self.assertTrue(late == self.planted("Q-02-02")["count"], "Q-02-02: the truth's count")
        clean_late = self.one("SELECT count(*) FROM clean.subscription_events WHERE CAST(recorded_at AS DATE) <> event_date")[0]
        self.assertEqual(clean_late, 0, "clean records every event on its event_date")
        other = self.one("""SELECT count(*) FROM raw.subscription_events r JOIN clean.subscription_events c USING (event_id)
                            WHERE r.recorded_at <> c.recorded_at AND c.event_type <> 'churn'""")[0]
        self.assertEqual(other, 0, "only churn events are recorded late")

    def test_q02_03_gbp_and_chf_amounts_carry_no_currency_in_raw(self):
        for table in ("subscriptions", "invoices"):
            mislabelled, foreign, same_amounts = self.one(f"""SELECT count(*) FILTER (WHERE r.currency = 'EUR' AND c.currency <> 'EUR'),
                    count(*) FILTER (WHERE c.currency <> 'EUR'),
                    count(*) FILTER (WHERE r.{'mrr_local' if table == 'subscriptions' else 'amount_local'} = c.{'mrr_local' if table == 'subscriptions' else 'amount_local'})
                FROM raw.{table} r JOIN clean.{table} c USING ({'subscription_id' if table == 'subscriptions' else 'invoice_id'})""")
            self.assertTrue(mislabelled == foreign, f"raw {table}: every GBP and CHF amount is labelled EUR, unconverted")
            self.assertTrue(same_amounts == self.clean[table].num_rows, f"raw {table}: the amounts are the clean (local) amounts")
            self.assertEqual({r[0] for r in self.rows(f"SELECT DISTINCT currency FROM raw.{table}")}, {"EUR"})
        self.assertTrue(self.planted("Q-02-03")["count"] == self.one("SELECT count(*) FROM clean.subscriptions WHERE currency <> 'EUR'")[0],
                        "Q-02-03: the truth's count")

    def test_q02_04_raw_payments_are_utc_instants(self):
        off = self.one("""SELECT count(*) FROM raw.payments r JOIN clean.payments c USING (payment_id)
                          WHERE timezone('Europe/Brussels', r.attempted_at) <> c.attempted_at""")[0]
        self.assertEqual(off, 0, "raw's UTC instant is clean's Brussels wall-clock time")
        days = self.one("""SELECT count(*) FROM raw.payments r JOIN clean.payments c USING (payment_id)
                           WHERE CAST(timezone('UTC', r.attempted_at) AS DATE) <> CAST(c.attempted_at AS DATE)""")[0]
        self.assertGreater(days, 0, "some payments fall on another day in UTC")
        self.assertTrue(self.planted("Q-02-04")["count"] == self.clean["payments"].num_rows, "Q-02-04: the truth's count")

    def test_q02_05_four_percent_of_running_subscriptions_end_on_9999_12_31(self):
        sentinel, running = self.one("""SELECT count(*) FILTER (WHERE r.end_date = DATE '9999-12-31'), count(*)
                                        FROM raw.subscriptions r JOIN clean.subscriptions c USING (subscription_id) WHERE c.end_date IS NULL""")
        self.assertTrue(0.03 <= sentinel / running <= 0.05, "about 4% of running subscriptions use the sentinel")
        self.assertTrue(sentinel == self.planted("Q-02-05")["count"], "Q-02-05: the truth's count")
        self.assertEqual(self.one("SELECT count(*) FROM clean.subscriptions WHERE end_date = DATE '9999-12-31'")[0], 0)

    def test_q02_06_segment_spellings(self):
        spellings = {r[0] for r in self.rows("SELECT DISTINCT segment FROM raw.accounts WHERE NOT is_test AND account_name NOT ILIKE '%test%'")}
        self.assertEqual(spellings, {"SMB", "smb", "Small Business", "Mid-Market", "midmarket", "Enterprise"})
        mapped = self.one("""SELECT count(*) FROM raw.accounts r JOIN clean.accounts c USING (account_id)
            WHERE CASE WHEN lower(r.segment) IN ('smb', 'small business') THEN 'SMB'
                       WHEN lower(replace(r.segment, '-', '')) = 'midmarket' THEN 'Mid-Market' ELSE r.segment END <> c.segment""")[0]
        self.assertEqual(mapped, 0, "each raw spelling maps back to its clean segment")
        respelled = self.one("SELECT count(*) FROM raw.accounts r JOIN clean.accounts c USING (account_id) WHERE r.segment <> c.segment")[0]
        self.assertTrue(self.planted("Q-02-06")["count"] == respelled, "Q-02-06: the truth's count")

    def test_q02_07_25_internal_test_accounts(self):
        tests = self.rows("SELECT is_test, account_name ILIKE '%test%' FROM raw.accounts WHERE account_id NOT IN (SELECT account_id FROM clean.accounts)")
        self.assertEqual(len(tests), 25)
        self.assertTrue(any(flag for flag, _ in tests), "some are flagged is_test")
        self.assertTrue(any(named and not flag for flag, named in tests), "some are named like '%test%' but not flagged")
        self.assertTrue(all(flag or named for flag, named in tests), "each is flagged or named as a test")
        self.assertEqual(self.one("SELECT count(*) FROM raw.subscriptions WHERE account_id NOT IN (SELECT account_id FROM clean.accounts)")[0], 0)
        self.assertTrue(self.planted("Q-02-07")["count"] == 25, "Q-02-07: the truth's count")

    def test_the_truth_records_each_quirk(self):
        self.assertEqual(set(self.truth["planted"]["raw"]), {f"Q-02-0{i}" for i in range(1, 8)})
        self.assertEqual(set(self.truth["findings"]["raw"]), {f"Q-02-0{i}" for i in range(1, 8)})

    def test_validate_rejects_raw_data_without_its_quirks(self):
        broken = {"clean": self.clean, "raw": {**self.raw, "subscription_events": self.clean["subscription_events"]}}
        with self.assertRaisesRegex(ValueError, "Q-02-01|FIND-02-13"):
            ll.validate(broken, self.truth)
        broken = {"clean": self.clean, "raw": {**self.raw, "accounts": self.clean["accounts"]}}
        with self.assertRaisesRegex(ValueError, "Q-02-06|Q-02-07"):
            ll.validate(broken, self.truth)


class Funnel(Fixture):
    """S8-05: the lead funnel and the costs."""

    def test_won_opportunities_and_their_accounts(self):
        bad = self.one("""SELECT count(*) FROM clean.opportunities o LEFT JOIN clean.accounts a USING (account_id)
            WHERE (o.is_won IS TRUE) <> (o.account_id IS NOT NULL) OR (o.is_won AND (a.account_id IS NULL OR a.created_at < o.closed_at))""")[0]
        self.assertEqual(bad, 0, "account_id only when won; that account exists and is created on or after the close")
        per_account = self.one("""SELECT count(*) FROM clean.accounts a WHERE a.created_at >= TIMESTAMP '2024-01-01'
            AND (SELECT count(*) FROM clean.opportunities o WHERE o.account_id = a.account_id) <> 1""")[0]
        self.assertEqual(per_account, 0, "each account created in the window has one won opportunity")
        legacy = self.one("""SELECT count(*) FROM clean.opportunities o JOIN clean.accounts a USING (account_id)
                             WHERE a.created_at < TIMESTAMP '2024-01-01'""")[0]
        self.assertEqual(legacy, 0)
        open_ok = self.one("""SELECT count(*) FROM clean.opportunities WHERE (closed_at IS NULL) <> (is_won IS NULL)
                              OR closed_at < created_at""")[0]
        self.assertEqual(open_ok, 0, "an open opportunity has no close and no outcome")
        self.assertGreater(self.one("SELECT count(*) FROM clean.opportunities WHERE closed_at IS NULL")[0], 0, "some are still open")
        self.assertGreater(self.one("SELECT count(*) FROM clean.opportunities WHERE NOT is_won")[0], 0, "some are lost")
        order = self.one("""SELECT count(*) FROM clean.opportunities o JOIN clean.leads l USING (lead_id) WHERE o.created_at < l.created_at""")[0]
        self.assertEqual(order, 0, "an opportunity follows its lead")
        self.assertEqual(self.one("SELECT count(*) - count(DISTINCT lead_id) FROM clean.opportunities")[0], 0, "one opportunity per lead at most")

    def test_lead_sources_match_the_spend_channels(self):
        channels = {r[0] for r in self.rows("SELECT DISTINCT channel FROM clean.marketing_spend_monthly")}
        self.assertEqual(channels, PAID_MEDIA, "marketing_spend_monthly stays paid media")
        sources = {r[0] for r in self.rows("SELECT DISTINCT source FROM clean.leads")}
        self.assertTrue(channels <= sources, "every paid channel names a lead source")
        self.assertTrue({"organic", "referral", "partner", "outbound"} <= sources, "the unpaid sources have no media spend")
        same = self.one("""SELECT count(*) FROM clean.opportunities o JOIN clean.leads l USING (lead_id) JOIN clean.accounts a USING (account_id)
                           WHERE a.acquisition_channel <> l.source OR a.segment <> l.segment""")[0]
        self.assertEqual(same, 0, "a won account's channel and segment are its lead's")
        self.assertEqual({r[0] for r in self.rows("SELECT DISTINCT acquisition_channel FROM clean.accounts")}, sources)

    def test_costs(self):
        months, types = self.one("SELECT count(DISTINCT month), count(DISTINCT cost_type) FROM clean.cogs_monthly")
        self.assertEqual(months, 24)
        self.assertGreaterEqual(types, 3)
        sm_types = {r[0] for r in self.rows("SELECT DISTINCT cost_type FROM clean.sm_expense_monthly")}
        self.assertTrue({"salaries", "tools", "partner_fees"} <= sm_types, "S8-05: salaries, tools and partner fees")
        self.assertEqual(self.one("SELECT count(*) FROM clean.sm_expense_monthly WHERE cost_type = 'partner_fees' AND channel <> 'partner'")[0], 0)
        firsts = self.one("""SELECT count(*) FROM (SELECT month FROM clean.cogs_monthly UNION ALL SELECT month FROM clean.sm_expense_monthly
                             UNION ALL SELECT month FROM clean.marketing_spend_monthly) WHERE day(month) <> 1""")[0]
        self.assertEqual(firsts, 0, "a month is its first day")
        self.assertEqual(self.one("""SELECT count(*) FROM (SELECT amount_eur AS a FROM clean.cogs_monthly UNION ALL SELECT amount_eur
                                     FROM clean.sm_expense_monthly UNION ALL SELECT spend_eur FROM clean.marketing_spend_monthly) WHERE a <= 0""")[0], 0)


class AppEvents(Fixture):
    """S8-06: app_events in UTC, 2025-10-01 to 2025-12-31, from active users of active accounts, for SQL-PAT-08's sessions."""

    # A TIMESTAMPTZ value reaches Python only with a time zone library the pipeline does not have, so these compare in SQL or by epoch.
    def test_window_users_and_accounts(self):
        outside = self.one("""SELECT count(*) FROM clean.app_events WHERE event_ts < TIMESTAMPTZ '2025-10-01 00:00:00+00'
                              OR event_ts >= TIMESTAMPTZ '2026-01-01 00:00:00+00'""")[0]
        self.assertEqual(outside, 0, "2025-10-01 to 2025-12-31 in UTC")
        inactive_user = self.one("""SELECT count(*) FROM clean.app_events a JOIN clean.users u USING (user_id)
            WHERE u.invited_at > timezone('Europe/Brussels', a.event_ts) OR u.deactivated_at <= timezone('Europe/Brussels', a.event_ts)""")[0]
        self.assertEqual(inactive_user, 0, "each event's user is active then")
        inactive_account = self.one("""SELECT count(*) FROM clean.app_events a WHERE NOT EXISTS (SELECT 1 FROM clean.subscriptions s
            WHERE s.account_id = a.account_id AND s.start_date <= CAST(timezone('Europe/Brussels', a.event_ts) AS DATE)
              AND (s.end_date IS NULL OR s.end_date > CAST(timezone('Europe/Brussels', a.event_ts) AS DATE)))""")[0]
        self.assertEqual(inactive_account, 0, "each event's account is active that day")
        ties = self.one("SELECT count(*) FROM (SELECT user_id, event_ts FROM clean.app_events GROUP BY ALL HAVING count(*) > 1)")[0]
        self.assertEqual(ties, 0, "a user has one event at an instant")
        ordered = self.one("""SELECT count(*) FROM (SELECT event_id, lag(event_id) OVER (ORDER BY event_ts, event_id) AS p FROM clean.app_events) WHERE p > event_id""")[0]
        self.assertEqual(ordered, 0, "event_id follows event_ts")

    def test_one_user_is_active_across_the_2025_10_26_clock_change(self):
        plant = self.truth["planted"]["app_events"]["clock_change_user"]
        times = [r[0] for r in self.rows("""SELECT epoch(event_ts) FROM clean.app_events WHERE user_id = ?
            AND event_ts BETWEEN TIMESTAMPTZ '2025-10-25 23:00:00+00' AND TIMESTAMPTZ '2025-10-26 03:00:00+00' ORDER BY 1""", [plant["user_id"]])]
        change = dt.datetime(2025, 10, 26, 1, 0, tzinfo=dt.timezone.utc).timestamp()
        self.assertTrue(any(t < change for t in times) and any(t >= change for t in times), "events on both sides of 01:00 UTC")
        gaps = [b - a for a, b in zip(times, times[1:])]
        self.assertTrue(gaps and max(gaps) < 30 * 60, "one session across the change: no gap of 30 minutes")
        local = [r[0] for r in self.rows("""SELECT timezone('Europe/Brussels', event_ts) FROM clean.app_events WHERE user_id = ?
            AND event_ts BETWEEN TIMESTAMPTZ '2025-10-25 23:00:00+00' AND TIMESTAMPTZ '2025-10-26 03:00:00+00' ORDER BY event_ts""", [plant["user_id"]])]
        self.assertTrue(any(b < a for a, b in zip(local, local[1:])), "in Brussels wall-clock time a later event looks earlier")

    def test_gaps_planted_near_30_minutes(self):
        gaps = {r[0] for r in self.rows("""SELECT gap FROM (SELECT epoch(event_ts) - epoch(lag(event_ts) OVER (PARTITION BY user_id ORDER BY event_ts)) AS gap
                                           FROM clean.app_events) WHERE gap BETWEEN 1790 AND 1810""")}
        self.assertTrue({1799, 1800, 1801} <= {int(g) for g in gaps}, "gaps of 29:59, 30:00 and 30:01 between a user's events")
        self.assertTrue(set(self.truth["planted"]["app_events"]["gaps_seconds"]) >= {1799, 1800, 1801})
        names = {r[0] for r in self.rows("SELECT DISTINCT event_name FROM clean.app_events")}
        self.assertTrue(3 <= len(names) <= 12, "a short list of event names")


class Determinism(Fixture):
    def test_appended_tables_shift_no_other_table(self):
        # GEN-02: one stream per table in TABLE_ORDER. With app_events replaced, every other table is the same (and the second
        # generation shows the seed gives the same data).
        empty = pa.table({n: pa.array([], t) for n, t in zip(self.clean["app_events"].column_names, self.clean["app_events"].schema.types)})
        with mock.patch.object(ll, "build_app_events", return_value=(empty, {"clock_change_user": {}, "gaps_seconds": []})):
            other, truth = ll.generate()
        for name, table in self.clean.items():
            if name != "app_events":
                self.assertTrue(table.equals(other["clean"][name]), name)
        for name, table in self.raw.items():
            if name != "app_events":
                self.assertTrue(table.equals(other["raw"][name]), f"raw {name}")
        self.assertTrue(truth["planted"]["raw"] == self.truth["planted"]["raw"], "the quirks' planted counts are the same")

    def test_a_second_generation_is_the_same_app_events_included(self):
        # The build's two-build hash test reuses one generation (ledgerloop_once), so this generates again, nothing mocked.
        other, truth = ll.generate()
        for schema in ("clean", "raw"):
            for name, table in self.tables[schema].items():
                self.assertTrue(table.equals(other[schema][name]), f"{schema} {name}")
        self.assertTrue(truth == ledgerloop_once.generated()[1], "the same truth")


class BuildGate(Fixture):
    """S8-01, GEN-01: the build fails when a finding's band does not hold, naming the finding."""

    def test_a_band_out_of_range_fails_check_and_validate(self):
        broken = copy.deepcopy(self.truth["findings"])
        broken["FIND-02-03"]["ratio"] = 2.5                     # outside 05's 1.6 to 1.9
        with self.assertRaisesRegex(ValueError, "^FIND-02-03"):
            ll.check(broken, self.truth)
        with mock.patch.object(ll, "measure", return_value=broken):
            with self.assertRaisesRegex(ValueError, "^FIND-02-03"):
                ll.validate(self.tables, self.truth)


class Notes(Fixture):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.db = duckdb.connect(config=NO_NETWORK)
        cls.db.execute("SET TimeZone = 'UTC'")
        cls.db.execute(DDL.read_text(encoding="utf-8").replace("{schema}", "ledgerloop"))
        for schema, source in (("ledgerloop", cls.clean), ("ledgerloop_raw", cls.raw)):
            for name, table in source.items():
                cls.db.register("src", table)
                cls.db.execute(f"INSERT INTO {schema}.{name} SELECT * FROM src")
                cls.db.unregister("src")
        cls.notes = ll_notes.schema_notes(cls.db, "ledgerloop")
        cls.raw_notes = ll_notes.raw_notes(cls.db, "ledgerloop_raw", ll_raw.RAW_TABLES)

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        super().tearDownClass()

    def test_ddl_keys(self):
        keys = {r[0]: r[1] for r in self.db.execute("""SELECT table_name, constraint_column_names FROM duckdb_constraints()
                                                       WHERE schema_name = 'ledgerloop' AND constraint_type = 'PRIMARY KEY'""").fetchall()}
        self.assertEqual(keys, KEYS, "GEN-05: every clean table has its key")
        raw_keys = {r[0] for r in self.db.execute("""SELECT table_name FROM duckdb_constraints()
                                                     WHERE schema_name = 'ledgerloop_raw' AND constraint_type = 'PRIMARY KEY'""").fetchall()}
        self.assertEqual(raw_keys, set(KEYS) - {"subscription_events"}, "GEN-05: the table with a key quirk (Q-02-01) has none")

    def test_clean_notes(self):
        by = {n["table"]: n for n in self.notes}
        self.assertEqual([n["table"] for n in self.notes], list(ll.CLEAN_TABLES))
        for table, n in by.items():
            self.assertEqual(n["schema"], "ledgerloop")
            self.assertTrue(n["grain"].startswith("one row per"), table)
            self.assertEqual(n["primary_key"], KEYS[table], table)
            self.assertEqual(n["row_count"], self.clean[table].num_rows, table)
            self.assertEqual(n["sample"]["columns"], [c for c, _ in COLUMNS[table]], table)
            self.assertEqual(len(n["sample"]["rows"]), min(5, n["row_count"]), table)
            self.assertEqual(n["from_level"], 6, f"{table}: LedgerLoop arrives with level 6")
            for f in n["foreign_keys"]:
                self.assertIn(f["ref_table"], COLUMNS, f"{table}: {f['ref_table']}")
                self.assertEqual(f["cardinality"], "1:N")
            text = json.dumps(n, ensure_ascii=False)
            self.assertNotIn("\u2014", text, "no em dash")
            for line in n.get("column_notes", {}).values():
                self.assertNotIn("NULL", line, "missing, not NULL")
        self.assertEqual([f["ref_table"] for f in by["subscription_events"]["foreign_keys"]], ["subscriptions", "accounts"])
        self.assertEqual(by["subscriptions"]["allowed_values"]["billing_period"], ["annual", "monthly"])
        self.assertEqual(by["subscription_events"]["allowed_values"]["event_type"], sorted(EVENT_TYPES))
        self.assertEqual(by["subscriptions"]["allowed_values"]["currency"], ["CHF", "EUR", "GBP"])
        for words in ("opening", "2024-01-01", "movement"):
            self.assertIn(words, by["subscription_events"]["column_notes"]["event_type"])
        self.assertIn("as_of_date", by["subscriptions"]["column_notes"]["mrr_local"])
        self.assertIn("UTC", by["app_events"]["column_notes"]["event_ts"])
        self.assertRegex(by["app_events"]["sample"]["rows"][0][3], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+00:00$")
        self.assertIn("Brussels", by["payments"]["column_notes"]["attempted_at"])
        self.assertIn("fictional", json.dumps(self.notes).lower(), "fictional data is labelled fictional")

    def test_raw_notes(self):
        by = {n["table"]: n for n in self.raw_notes}
        clean = {n["table"]: n for n in self.notes}
        self.assertEqual(set(by), set(COLUMNS))
        for table, n in by.items():
            self.assertTrue(n["grain"].startswith("This table may hold errors."), table)
            self.assertIn(clean[table]["grain"].lower(), n["grain"].lower(), table)
            self.assertEqual(n["primary_key"], clean[table]["primary_key"], table)
            self.assertEqual(n["from_level"], 6)
            self.assertEqual(n["row_count"], self.raw[table].num_rows, table)
            self.assertNotIn("\u2014", json.dumps(n, ensure_ascii=False))
        self.assertIn("UTC", by["payments"]["column_notes"]["attempted_at"])
        self.assertIn("segment", by["accounts"]["allowed_values"])
        self.assertIn("smb", by["accounts"]["allowed_values"]["segment"])
        # Mailvora's rule: a raw column note says what the column holds, never a clean claim a quirk breaks.
        broken_claims = {
            ("subscription_events", "mrr_delta_local"): ("MRR on that date", "sum"),           # Q-02-01's duplicates
            ("subscriptions", "mrr_local"): ("its currency",),                                 # Q-02-03's labels
            ("subscriptions", "currency"): ("GB", "CH"),                                       # Q-02-03
            ("invoices", "amount_local"): ("subscription's currency",),                        # Q-02-03
            ("subscriptions", "end_date"): ("the day the subscription ended", "churn", "missing while"),   # Q-02-05's sentinel
            ("accounts", "created_at"): ("customer",),                                         # Q-02-07's test accounts
            ("accounts", "is_test"): ("True for an internal test account",),                   # Q-02-07: some are not flagged
            ("accounts", "account_name"): ("company",),                                        # Q-02-07
            ("accounts", "segment"): ("SMB, Mid-Market",),                                     # Q-02-06
            ("accounts", "acquisition_channel"): ("lead",),                                    # Q-02-07: test accounts have none
        }
        for (table, column), claims in broken_claims.items():
            text = by[table].get("column_notes", {}).get(column, "")
            for claim in claims:
                self.assertNotIn(claim.lower(), text.lower(), f"raw {table}.{column} repeats a claim its quirk breaks")
        for table in set(COLUMNS) - QUIRK_TABLES:
            self.assertEqual(by[table].get("column_notes"), clean[table].get("column_notes"), f"raw {table} is an unchanged copy")


# E-215: the rate each currency converts at, the last fx_rates rate on or before 2025-12-31 (E-210, E-211: one fixed date's rate).
E215_RATE_DATE = dt.date(2025, 12, 31)
E215_MONTHS = [dt.date(2024 + i // 12, i % 12 + 1, 1) for i in range(24)]   # January 2024 to December 2025


def month_end(first: dt.date) -> dt.date:
    return (first.replace(day=28) + dt.timedelta(4)).replace(day=1) - dt.timedelta(1)


def e215_rows(clean: dict) -> list:
    """E-215's mrr_monthly rows worked out here, apart from the view: per account and month, the sum of its subscription events'
    mrr_delta_local up to the month's last day, each at its subscription's currency's last rate on or before 2025-12-31, rounded half
    up to the cent; a row only when that MRR is above 0. Sorted by account and month."""
    currency = dict(zip(clean["subscriptions"].column("subscription_id").to_pylist(), clean["subscriptions"].column("currency").to_pylist()))
    latest = {}
    for day, cur, rate in zip(*(clean["fx_rates"].column(c).to_pylist() for c in ("rate_date", "currency", "eur_per_unit"))):
        if day <= E215_RATE_DATE and (cur not in latest or day > latest[cur][0]):
            latest[cur] = (day, rate)
    events = collections.defaultdict(list)
    e = clean["subscription_events"]
    for account, sub, day, delta in zip(*(e.column(c).to_pylist() for c in ("account_id", "subscription_id", "event_date", "mrr_delta_local"))):
        events[account].append((day, delta * latest[currency[sub]][1]))
    rows = []
    for account in sorted(events):
        for first in E215_MONTHS:
            mrr = sum((eur for day, eur in events[account] if day <= month_end(first)), Decimal(0))
            if mrr > 0:
                rows.append((account, first, mrr.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)))
    return rows


class MrrMonthly(Fixture):
    """Sprint 8 Part 2 (S8-C28, E-215): the build's mrr_monthly view, made over this generation's clean tables in a schema named
    ledgerloop, as the build makes it, and its note (pipeline/ledgerloop/notes.py)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.db = duckdb.connect(config=NO_NETWORK)
        cls.db.execute("SET TimeZone = 'UTC'")
        cls.db.execute(DDL.read_text(encoding="utf-8").replace("{schema}", "ledgerloop"))
        for name, table in cls.clean.items():
            cls.db.register("src", table)
            cls.db.execute(f"INSERT INTO ledgerloop.{name} SELECT * FROM src")
            cls.db.unregister("src")
        cls.db.execute(build_course_db.MRR_MONTHLY_SQL.replace("{schema}", "ledgerloop"))
        cls.view = cls.db.execute("SELECT account_id, month, mrr_eur FROM ledgerloop.mrr_monthly ORDER BY 1, 2").fetchall()

    @classmethod
    def tearDownClass(cls):
        cls.db.close()
        super().tearDownClass()

    def test_the_build_makes_it_in_ledgerloop_and_its_clean_edges_only(self):
        # Task E1 (S8-C39): ledgerloop_edge_cases, the six LedgerLoop inbox cases' edge schema, has it over its own tables too.
        self.assertEqual(build_course_db.MRR_MONTHLY_SCHEMAS, ("ledgerloop", "ledgerloop_edge_saas", "ledgerloop_edge_cases"),
                         "not ledgerloop_raw or ledgerloop_edge_clean: cases read the clean schema")
        columns = self.db.execute("""SELECT column_name, data_type FROM information_schema.columns
                                     WHERE table_schema = 'ledgerloop' AND table_name = 'mrr_monthly' ORDER BY ordinal_position""").fetchall()
        self.assertEqual(columns, [("account_id", "INTEGER"), ("month", "DATE"), ("mrr_eur", "DECIMAL(12,2)")])

    def test_each_row_is_e215s_month_end_mrr_at_the_fixed_rate(self):
        self.assertEqual(self.view, e215_rows(self.clean), "rows and values, to the cent")
        self.assertEqual(len({(a, m) for a, m, _ in self.view}), len(self.view), "one row per account and month")
        self.assertEqual(sorted({m for _, m, _ in self.view}), E215_MONTHS, "January 2024 to December 2025")
        self.assertTrue(all(v > 0 for *_, v in self.view), "no row with no MRR")

    def account_months(self):
        """Each account's local MRR in force at each month end of the window (clean.in_force summed over its subscriptions)."""
        return self.rows("""SELECT account_id, CAST(date_trunc('month', month_end) AS DATE) AS month, sum(mrr) AS mrr
                            FROM clean.in_force GROUP BY ALL ORDER BY 1, 2""")

    def test_no_row_in_a_month_whose_last_day_has_no_mrr(self):
        rows = {(a, m) for a, m, _ in self.view}
        none = [(a, m) for a, m, mrr in self.account_months() if mrr == 0]
        self.assertGreater(len(none), 1000, "account months with no MRR on the last day")
        self.assertEqual([k for k in none if k in rows], [], "account months with 0 MRR on the last day that have a row")
        self.assertEqual({(a, m) for a, m, mrr in self.account_months() if mrr > 0}, rows, "and every month with MRR has one")

    def test_an_account_that_churns_and_comes_back_has_no_row_in_between(self):
        months = collections.defaultdict(list)
        for a, m, mrr in self.account_months():
            months[a].append((m, mrr))
        back = {a for (a,) in self.rows("SELECT DISTINCT account_id FROM clean.subscription_events WHERE event_type = 'reactivation'")}
        gaps = []
        for a in sorted(back):
            live = [m for m, mrr in months[a] if mrr > 0]
            gaps += [(a, m) for m, mrr in months[a] if mrr == 0 and live and live[0] < m < live[-1]]
        self.assertGreater(len({a for a, _ in gaps}), 10, "accounts with months without MRR between a churn and a reactivation")
        rows = {(a, m) for a, m, _ in self.view}
        self.assertEqual([g for g in gaps if g in rows], [], "no row in a month between the churn and the comeback")
        self.assertTrue(all((a, months[a][-1][0]) in rows for a in back if months[a][-1][1] > 0), "the comeback has rows again")

    def test_every_account_active_on_2024_01_01_and_at_its_month_end_has_a_january_2024_row(self):
        # E-215's rule is the MRR in force on the month's last day, so an opening account that churns during January 2024 has no
        # January row: E-215's "every account active on 2024-01-01 has its first row in January 2024" holds only for the ones still
        # active on 2024-01-31. E-216: whether an account is new comes from subscription_events (event_type new or reactivation),
        # never from its first mrr_monthly row, so a January churner that comes back later is a reactivation.
        opening = {a for (a,) in self.rows("SELECT DISTINCT account_id FROM clean.subscription_events WHERE event_type = 'opening'")}
        still = {a for (a,) in self.rows("""SELECT account_id FROM clean.subscription_events WHERE event_date <= DATE '2024-01-31'
                                            GROUP BY 1 HAVING sum(mrr_delta_local) > 0""")}
        january = {a for a, m, _ in self.view if m == dt.date(2024, 1, 1)}
        self.assertTrue(opening & still and opening & still <= january, "an opening balance still in force on 31 January has a January row")
        self.assertEqual(opening & january, opening & still, "one that churns in January has none")
        self.assertEqual(min(m for a, m, _ in self.view if a in opening & still), dt.date(2024, 1, 1))
        new = {a for (a,) in self.rows("SELECT DISTINCT account_id FROM clean.subscription_events WHERE event_type = 'new' AND event_date <= DATE '2024-01-31'")}
        self.assertEqual(january - opening, new & still, "the rest of January's rows are accounts won that month")

    def test_its_note(self):
        notes = ll_notes.view_notes(self.db, "ledgerloop")
        self.assertEqual([n["table"] for n in notes], ["mrr_monthly"])
        n = notes[0]
        self.assertEqual((n["schema"], n["primary_key"], n["from_level"], n["row_count"]), ("ledgerloop", ["account_id", "month"], 6, len(self.view)))
        self.assertTrue(n["grain"].startswith("one row per account and calendar month"), n["grain"])
        self.assertEqual([f["ref_table"] for f in n["foreign_keys"]], ["accounts"])
        self.assertEqual(n["sample"]["columns"], ["account_id", "month", "mrr_eur"])
        text = json.dumps(n, ensure_ascii=False)
        for words in ("no row", "2025-12-31", "fx_rates", "reactivation", "opening", "cent", "subscription_events"):
            self.assertIn(words, text, f"the note says {words}")
        self.assertNotIn("—", text, "no em dash")
        self.assertNotIn("NULL", text, "missing, not NULL")


if __name__ == "__main__":
    unittest.main()

"""Sprint 8 Part 2, Task E1 (ruling S8-C39): ledgerloop_edge_cases, the hidden edge data of the six LedgerLoop inbox cases,
CASE-SAAS-01 to -05 and CASE-MKT-05, planted inside the windows their prompts name.

- It holds ledgerloop's sixteen tables with their columns, types and primary keys, and the build's mrr_monthly view (E-215) over
  its own tables, so every table the schema panel shows a level 6 item is there (C52). The tables no case reads hold no row.
- One test per plant of each case: CASE-SAAS-01's month where MRR falls, non-EUR accounts at one fixed rate and an account with MRR
  in December 2024 only; CASE-SAAS-02's churn in three months of different base sizes, months with none, and accounts that leave and
  come back; CASE-SAAS-03's five movements, its comeback whose first mrr_monthly row is not new (E-216) and its bridge to the cent;
  CASE-SAAS-04's base per segment, accounts that end at 0 or above their start, and accounts left out; CASE-SAAS-05's cohorts,
  retained, churned and returning accounts, months after December 2025 and costs sized to the edge; CASE-MKT-05's sources with no
  spend or no won deal, an opportunity after June and leads with none.
- Every CP2 and CP4 truth query of the six cases returns exactly one number there (P16), and each CP3 reference returns rows.
- Its rows follow LedgerLoop's rules (S8-02, S8-03, S8-05), every object of Part 1 keeps its rows and hash (S8-C31), and its
  description lists each plant under its tables.

Assertions name schemas, tables, IDs, months and counts only; a key is read only to run it, and no message quotes one.
"""
import datetime as dt
import json
import pathlib
import re
import shutil
import tempfile
import unittest
from decimal import ROUND_HALF_UP, Decimal

import duckdb

from course_build import build_course_db   # L50: the paths, and Mailvora and LedgerLoop generated once per process

NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17
ROOT = pathlib.Path(build_course_db.ROOT)
CE = "ledgerloop_edge_cases"
CASES = ("CASE-SAAS-01", "CASE-SAAS-02", "CASE-SAAS-03", "CASE-SAAS-04", "CASE-SAAS-05", "CASE-MKT-05")
# S8-C31: every table and view as built at the end of Part 1 (0.8.0); Part 2 only adds objects.
BEFORE_SPRINT8B = json.loads((pathlib.Path(__file__).resolve().parent / "manifest_before_sprint8b.json").read_text(encoding="utf-8"))["tables"]
# The tables the six cases read (their keys, CP3 items and records), which hold the plants; the rest of ledgerloop's tables are there
# empty, for the schema panel (C52).
READ = {"accounts", "plans", "subscriptions", "subscription_events", "fx_rates", "marketing_spend_monthly", "leads", "opportunities",
        "cogs_monthly", "sm_expense_monthly"}
EMPTY = {"invoices", "payments", "users", "usage_weekly", "support_tickets", "app_events"}
WINDOW = ("2024-01-01", "2025-12-31")
E215_RATE_DATE = "2025-12-31"
# E-215 worked out in SQL apart from the view (as pipeline/tests/test_edge_pat.py does): per account and month the sum of its
# subscription events' mrr_delta_local up to the month's last day, at each currency's last rate on or before 2025-12-31, to the cent.
E215_SQL = """WITH months AS (SELECT CAST(range AS DATE) AS month FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH)),
    rate AS (SELECT currency, arg_max(eur_per_unit, rate_date) AS eur FROM {s}.fx_rates WHERE rate_date <= DATE '2025-12-31' GROUP BY 1),
    m AS (SELECT e.account_id, months.month, sum(e.mrr_delta_local * rate.eur) AS mrr
          FROM months JOIN {s}.subscription_events e ON e.event_date <= CAST(months.month + INTERVAL 1 MONTH - INTERVAL 1 DAY AS DATE)
          JOIN {s}.subscriptions sub ON sub.subscription_id = e.subscription_id JOIN rate ON rate.currency = sub.currency GROUP BY ALL)
    SELECT account_id, month, round(mrr, 2) AS mrr_eur FROM m WHERE mrr > 0"""
# Every account and month from `first` to `last` (first days), with its MRR (0 for no row) and the month before's: a spine over
# mrr_monthly, apart from any key.
SPINE = """WITH months AS (SELECT CAST(range AS DATE) AS month FROM range(TIMESTAMP '{first}', TIMESTAMP '{last}' + INTERVAL 1 DAY, INTERVAL 1 MONTH)),
    accounts AS (SELECT DISTINCT account_id FROM {s}.mrr_monthly),
    filled AS (SELECT a.account_id, m.month, coalesce(r.mrr_eur, 0) AS mrr FROM accounts a CROSS JOIN months m
               LEFT JOIN {s}.mrr_monthly r ON r.account_id = a.account_id AND r.month = m.month)
    SELECT account_id, month, mrr, lag(mrr) OVER (PARTITION BY account_id ORDER BY month) AS before FROM filled"""
H1_LEADS = "l.created_at >= TIMESTAMP '2025-01-01 00:00:00' AND l.created_at < TIMESTAMP '2025-07-01 00:00:00'"   # leads aliased l


def d(text: str) -> dt.date:
    return dt.date.fromisoformat(text)


def months(first: str, last: str) -> list:
    a, b = d(first), d(last)
    out = []
    while a <= b:
        out.append(a)
        a = (a.replace(day=28) + dt.timedelta(4)).replace(day=1)
    return out


class EdgeCases(unittest.TestCase):
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

    def primary_keys(self, schema):
        return {t: list(c) for t, c in self.con.execute("""SELECT table_name, constraint_column_names FROM duckdb_constraints()
                                                           WHERE schema_name = ? AND constraint_type = 'PRIMARY KEY'""", [schema]).fetchall()}

    def rows_of(self, account):
        return self.col(f"SELECT month FROM {CE}.mrr_monthly WHERE account_id = ? ORDER BY 1", [account])

    def month_totals(self, first, last):
        return self.con.execute(f"""SELECT month, sum(mrr_eur), count(*) FROM {CE}.mrr_monthly WHERE month BETWEEN DATE '{first}' AND DATE '{last}'
                                    GROUP BY 1 ORDER BY 1""").fetchall()

    def movements(self, first, last):
        """Each account's movement in each month from `first` to `last` on a spine from the month before (CASE-SAAS-03's rules, apart
        from the key): (month, account, movement, amount), the amount signed, every account with a change."""
        before = (d(first).replace(day=1) - dt.timedelta(1)).replace(day=1)
        return self.con.execute(f"""WITH s AS ({SPINE.format(s=CE, first=before, last=last)}),
            new AS (SELECT DISTINCT account_id, CAST(date_trunc('month', event_date) AS DATE) AS month FROM {CE}.subscription_events WHERE event_type = 'new')
            SELECT s.month, s.account_id,
                   CASE WHEN s.before = 0 AND s.mrr > 0 THEN CASE WHEN n.account_id IS NULL THEN 'reactivation' ELSE 'new' END
                        WHEN s.before > 0 AND s.mrr = 0 THEN 'churn'
                        WHEN s.mrr > s.before THEN 'expansion'
                        WHEN s.mrr < s.before THEN 'contraction' END AS movement,
                   CASE WHEN s.before > 0 AND s.mrr = 0 THEN -s.before WHEN s.before = 0 THEN s.mrr ELSE s.mrr - s.before END AS amount
            FROM s LEFT JOIN new n ON n.account_id = s.account_id AND n.month = s.month
            WHERE s.month >= DATE '{first}' AND s.mrr <> s.before ORDER BY 1, 2""").fetchall()

    # ---- the schema, its tables and the lock on everything else -----------------------------------------------------------------

    def test_it_has_ledgerloops_tables_columns_and_primary_keys_and_the_view(self):
        tables, views = self.names(CE)
        self.assertEqual((tables, views), self.names("ledgerloop"), "ledgerloop's sixteen tables and its one view, mrr_monthly")
        self.assertEqual(tables, READ | EMPTY)
        for t in sorted(tables | views):
            with self.subTest(table=t):
                self.assertEqual(self.columns(CE, t), self.columns("ledgerloop", t), f"{CE}.{t} has ledgerloop's columns and types")
        self.assertEqual(self.primary_keys(CE), self.primary_keys("ledgerloop"), "a primary key on every table, as in ledgerloop (GEN-05)")
        for t in sorted(READ):
            self.assertGreaterEqual(self.one(f"SELECT count(*) FROM {CE}.{t}")[0], 1, f"{CE}.{t} has rows")
        for t in sorted(EMPTY):
            self.assertEqual(self.one(f"SELECT count(*) FROM {CE}.{t}")[0], 0, f"{CE}.{t}: no case reads it")
        self.assertLessEqual(self.one(f"SELECT count(*) FROM {CE}.accounts")[0], 36, "a few dozen accounts at most")

    def test_the_build_makes_its_view_and_lists_it_as_a_schema_with_no_notes(self):
        self.assertIn(CE, build_course_db.MRR_MONTHLY_SCHEMAS, "mrr_monthly over its own tables (E-215)")
        self.assertNotIn(CE, build_course_db.RAW_EDGE_SCHEMAS, "it mirrors the clean ledgerloop")
        notes = json.loads((self.dir / "schema-notes.json").read_text(encoding="utf-8"))
        self.assertFalse([n for n in notes if n["schema"] == CE], "an edge schema has no table notes")
        checkpoints = json.loads((self.dir / "truth" / "checkpoints.json").read_text(encoding="utf-8"))
        self.assertIn(CE, checkpoints["schemas"], "the schemas built (S6-13)")

    def test_every_object_of_part_1_is_unchanged_and_e1_adds_only_its_schema(self):
        self.assertEqual(len(BEFORE_SPRINT8B), 344)
        moved = sorted(name for name, entry in BEFORE_SPRINT8B.items() if self.manifest["tables"].get(name) != entry)
        self.assertEqual(moved, [], "objects of Part 1 whose rows or hash changed")
        mine = sorted(n for n in self.manifest["tables"] if n.split(".")[0] == CE)
        self.assertEqual(mine, sorted(f"{CE}.{t}" for t in READ | EMPTY | {"mrr_monthly"}))
        self.assertEqual(len(self.manifest["tables"][f"{CE}.mrr_monthly"]["view_sql_sha256"]), 64)
        for t in READ | EMPTY:
            self.assertEqual(len(self.manifest["tables"][f"{CE}.{t}"]["sha256"]), 64, t)

    def test_mrr_monthly_reads_its_own_tables_and_gives_e215s_rows(self):
        sql = self.one("SELECT sql FROM duckdb_views() WHERE schema_name = ? AND view_name = 'mrr_monthly'", [CE])[0]
        read = set(re.findall(r"\b(ledgerloop\w*)\.(\w+)", sql))
        self.assertEqual({s for s, _ in read}, {CE}, "it reads its own schema only")
        self.assertEqual({t for _, t in read} - {"mrr_monthly"}, {"fx_rates", "subscription_events", "subscriptions"})
        e215 = f"SELECT * FROM ({E215_SQL.format(s=CE)})"
        extra, missing = self.one(f"""SELECT (SELECT count(*) FROM (SELECT * FROM {CE}.mrr_monthly EXCEPT {e215})),
                                             (SELECT count(*) FROM ({e215} EXCEPT SELECT * FROM {CE}.mrr_monthly))""")
        self.assertEqual((extra, missing), (0, 0), "E-215's rows, to the cent")
        rows, keys = self.one(f"SELECT count(*), count(DISTINCT (account_id, month)) FROM {CE}.mrr_monthly")
        self.assertEqual(rows, keys, "one row per account and month")
        self.assertEqual(self.col(f"SELECT DISTINCT month FROM {CE}.mrr_monthly ORDER BY 1"), months("2024-01-01", "2025-12-01"),
                         "a row in each of the 24 months")

    # ---- CASE-SAAS-01: each month of 2025 on the month before (January on December 2024) -------------------------------------

    def test_saas_01_mrr_falls_in_two_months_of_2025(self):
        totals = self.month_totals("2024-12-01", "2025-12-01")
        self.assertEqual([m for m, *_ in totals], months("2024-12-01", "2025-12-01"), "every month from December 2024 has MRR")
        falls = [m for (m, total, _), (_, prev, _) in zip(totals[1:], totals) if total < prev]
        self.assertEqual(falls, [d("2025-03-01"), d("2025-08-01")], "MRR falls in March and August 2025")
        self.assertEqual(len({n for *_, n in totals[1:]}), 5, "active accounts change over 2025, so ARPA is per month")

    def test_saas_01_non_eur_accounts_at_one_fixed_rate(self):
        accounts = self.col(f"SELECT DISTINCT account_id FROM {CE}.subscriptions WHERE currency <> 'EUR' ORDER BY 1")
        self.assertEqual(accounts, [2, 3, 14, 18, 23], "CHF and GBP accounts")
        rates = dict(self.con.execute(f"SELECT currency, eur_per_unit FROM {CE}.fx_rates WHERE rate_date = DATE '{E215_RATE_DATE}'").fetchall())
        local = self.con.execute(f"""SELECT m.account_id, m.month, m.mrr_eur, s.currency,
                   (SELECT sum(e.mrr_delta_local) FROM {CE}.subscription_events e WHERE e.account_id = m.account_id
                    AND e.event_date <= last_day(m.month)) FROM {CE}.mrr_monthly m
            JOIN (SELECT DISTINCT account_id, currency FROM {CE}.subscriptions) s USING (account_id) WHERE s.currency <> 'EUR'""").fetchall()
        self.assertGreater(len(local), 0)
        for account, month, eur, currency, amount in local:
            with self.subTest(account=account, month=str(month)):
                self.assertEqual(eur, (amount * rates[currency]).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), "the 2025-12-31 rate")
        for currency in ("CHF", "GBP"):
            moved = self.one(f"""SELECT count(DISTINCT eur_per_unit) FROM {CE}.fx_rates WHERE currency = ? AND rate_date = last_day(rate_date)
                                 AND rate_date BETWEEN DATE '2024-12-31' AND DATE '2025-12-31'""", [currency])[0]
            self.assertGreater(moved, 1, f"{currency}'s month-end rates move, so converting each month at its own rate gives other euros")

    def test_saas_01_an_account_with_mrr_in_december_2024_only(self):
        only = self.col(f"""SELECT account_id FROM {CE}.mrr_monthly GROUP BY 1
                            HAVING min(month) = DATE '2024-12-01' AND max(month) = DATE '2024-12-01' ORDER BY 1""")
        self.assertEqual(only, [14], "account 14 has MRR at the end of December 2024 and of no other month")

    # ---- CASE-SAAS-02: logo churn per month, February to September 2025 ----------------------------------------------------------

    def churn_by_month(self):
        return self.con.execute(f"""SELECT CAST(b.month + INTERVAL 1 MONTH AS DATE) AS month, count(*),
                   list(b.account_id ORDER BY b.account_id) FILTER (WHERE m.account_id IS NULL)
            FROM {CE}.mrr_monthly b LEFT JOIN {CE}.mrr_monthly m ON m.account_id = b.account_id AND m.month = CAST(b.month + INTERVAL 1 MONTH AS DATE)
            WHERE b.month BETWEEN DATE '2025-01-01' AND DATE '2025-08-01' GROUP BY 1 ORDER BY 1""").fetchall()

    def test_saas_02_churn_in_three_months_of_different_bases_and_months_with_none(self):
        got = [(m, n, churned or []) for m, n, churned in self.churn_by_month()]
        self.assertEqual(got, [(d("2025-02-01"), 14, []), (d("2025-03-01"), 15, [7, 10, 16]), (d("2025-04-01"), 13, []),
                               (d("2025-05-01"), 13, [4]), (d("2025-06-01"), 14, []), (d("2025-07-01"), 15, []),
                               (d("2025-08-01"), 16, [2, 20]), (d("2025-09-01"), 16, [])],
                         "per month: accounts at start and the churned ones")
        churned = sum(len(c) for *_, c in got)
        base = sum(n for _, n, _ in got)
        pooled = (Decimal(100 * churned) / base).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        mean = (sum(Decimal(100 * len(c)) / n for _, n, c in got) / len(got)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        self.assertNotEqual(pooled, mean, "the pooled rate is not the mean of the monthly rates at 1 decimal")

    def test_saas_02_accounts_that_leave_and_come_back(self):
        self.assertEqual(self.rows_of(16), months("2025-01-01", "2025-02-01") + months("2025-06-01", "2025-12-01"),
                         "account 16 churns in March 2025 and comes back in June 2025, inside the window")
        june = self.con.execute(f"""SELECT event_type, event_date FROM {CE}.subscription_events WHERE account_id = 12
                                    AND event_date BETWEEN DATE '2025-06-01' AND DATE '2025-06-30' ORDER BY event_date""").fetchall()
        self.assertEqual(june, [("churn", d("2025-06-17")), ("reactivation", d("2025-06-28"))])
        self.assertIn(d("2025-05-01"), self.rows_of(12))
        self.assertIn(d("2025-06-01"), self.rows_of(12), "account 12 leaves and comes back within June 2025: MRR at both month ends")

    # ---- CASE-SAAS-03: the MRR bridge, July to September 2025 --------------------------------------------------------------------

    def test_saas_03_each_movement_at_least_once(self):
        got = {}
        for _, account, movement, _ in self.movements("2025-07-01", "2025-09-01"):
            got.setdefault(movement, []).append(account)
        self.assertEqual(got, {"new": [21, 22, 23], "expansion": [11, 5], "contraction": [3, 8], "churn": [2, 20], "reactivation": [6]},
                         "the accounts of each movement, July to September 2025")

    def test_saas_03_a_comeback_whose_first_row_is_not_new(self):
        events = self.con.execute(f"SELECT event_type, event_date FROM {CE}.subscription_events WHERE account_id = 6 ORDER BY event_id").fetchall()
        self.assertEqual(events, [("opening", d("2024-01-01")), ("churn", d("2024-01-20")), ("reactivation", d("2025-08-11"))],
                         "account 6 churns in January 2024 and comes back in August 2025, never as new (E-216)")
        self.assertEqual(self.rows_of(6)[0], d("2025-08-01"), "no January 2024 row: its first mrr_monthly row is the comeback")
        first_rows_without_new = self.col(f"""SELECT m.account_id FROM (SELECT account_id, min(month) AS first FROM {CE}.mrr_monthly GROUP BY 1) m
            WHERE m.first > DATE '2024-01-01' AND NOT EXISTS (SELECT 1 FROM {CE}.subscription_events e WHERE e.account_id = m.account_id
                  AND e.event_type = 'new' AND date_trunc('month', e.event_date) = m.first) ORDER BY 1""")
        self.assertEqual(first_rows_without_new, [6], "the only account whose first row is not its new month")

    def test_saas_03_the_bridge_reconciles_to_the_cent_each_month(self):
        totals = dict((m, t) for m, t, _ in self.month_totals("2025-06-01", "2025-09-01"))
        moved = {}
        for month, _, _, amount in self.movements("2025-07-01", "2025-09-01"):
            moved[month] = moved.get(month, Decimal(0)) + amount
        for month in months("2025-07-01", "2025-09-01"):
            with self.subTest(month=str(month)):
                before = (month - dt.timedelta(1)).replace(day=1)
                self.assertEqual(totals[before] + moved[month], totals[month], "starting MRR plus the movements is ending MRR")

    # ---- CASE-SAAS-04: 12-month NRR and GRR per segment, September 2024 to September 2025 -----------------------------------------

    def retention(self):
        return self.con.execute(f"""SELECT a.segment, s.account_id, s.mrr_eur, coalesce(e.mrr_eur, 0)
            FROM {CE}.mrr_monthly s JOIN {CE}.accounts a USING (account_id)
            LEFT JOIN {CE}.mrr_monthly e ON e.account_id = s.account_id AND e.month = DATE '2025-09-01'
            WHERE s.month = DATE '2024-09-01' ORDER BY 1, 2""").fetchall()

    def test_saas_04_each_segment_has_a_base_some_end_at_0_and_some_above_their_start(self):
        rows = self.retention()
        base = {}
        for segment, account, *_ in rows:
            base.setdefault(segment, []).append(account)
        self.assertEqual(base, {"Enterprise": [1, 2, 11], "Mid-Market": [3, 5, 10, 12], "SMB": [4, 7, 8, 9]})
        self.assertEqual(sorted(a for _, a, _, end in rows if end == 0), [2, 4, 7, 10], "no row in September 2025: they end at 0")
        self.assertEqual(sorted(a for _, a, start, end in rows if end > start), [1, 5, 9, 11], "above their start: GRR caps them")

    def test_saas_04_a_cap_on_the_totals_is_not_the_cap_per_account_in_any_segment(self):
        for segment in ("Enterprise", "Mid-Market", "SMB"):
            rows = [(start, end) for s, _, start, end in self.retention() if s == segment]
            per_account = sum(min(start, end) for start, end in rows)
            on_totals = min(sum(end for _, end in rows), sum(start for start, _ in rows))
            with self.subTest(segment=segment):
                self.assertNotEqual(per_account, on_totals, "an expansion beside a loss in the segment")

    def test_saas_04_accounts_left_out_of_the_base(self):
        early = self.col(f"""SELECT a.account_id FROM {CE}.accounts a WHERE a.created_at < TIMESTAMP '2024-10-01 00:00:00'
            AND NOT EXISTS (SELECT 1 FROM {CE}.mrr_monthly m WHERE m.account_id = a.account_id AND m.month = DATE '2024-09-01') ORDER BY 1""")
        self.assertEqual(early, [6], "created before October 2024 with no MRR in September 2024")
        later = self.col(f"""SELECT a.account_id FROM {CE}.accounts a JOIN {CE}.mrr_monthly e ON e.account_id = a.account_id AND e.month = DATE '2025-09-01'
            WHERE a.created_at >= TIMESTAMP '2024-10-01 00:00:00' ORDER BY 1""")
        self.assertEqual(later, [13, 15, 16, 17, 18, 19, 21, 22, 23], "accounts that start after September 2024, with MRR in September 2025")

    # ---- CASE-SAAS-05: cohorts by created_at, January to September 2025; months 1, 3 and 6; CAC payback --------------------------

    def cohorts(self):
        return self.con.execute(f"""SELECT CAST(date_trunc('month', created_at) AS DATE), list(account_id ORDER BY account_id) FROM {CE}.accounts
            WHERE created_at >= TIMESTAMP '2025-01-01 00:00:00' AND created_at < TIMESTAMP '2025-10-01 00:00:00' GROUP BY 1 ORDER BY 1""").fetchall()

    def test_saas_05_cohorts_in_several_months(self):
        self.assertEqual(self.cohorts(), [(d("2025-01-01"), [15, 16]), (d("2025-02-01"), [17]), (d("2025-03-01"), [18]), (d("2025-05-01"), [19, 20]),
                                          (d("2025-07-01"), [21]), (d("2025-08-01"), [22]), (d("2025-09-01"), [23])])
        later = self.one(f"SELECT count(*) FROM {CE}.accounts WHERE extract('day' FROM created_at) = 1")[0]
        self.assertEqual(later, 0, "every account is created after the 1st, so 30-day months are not calendar months")
        days = self.one(f"SELECT date_diff('day', CAST(created_at AS DATE), DATE '2025-02-01') FROM {CE}.accounts WHERE account_id = 16")[0]
        self.assertLess(days, 30, "account 16's month 1 by the calendar, February 2025, is month 0 in 30-day months")
        self.assertNotIn(d("2025-03-01"), self.rows_of(16), "and it has no row in March 2025")

    def test_saas_05_a_retained_a_churned_and_a_returning_account(self):
        def kept(account, cohort):
            rows = set(self.rows_of(account))
            return [m in rows for m in (d(cohort).replace(month=d(cohort).month + k) for k in (1, 3, 6))]
        self.assertEqual(kept(15, "2025-01-01"), [True, True, True], "account 15 is retained at months 1, 3 and 6")
        self.assertEqual(kept(20, "2025-05-01"), [True, False, False], "account 20 churns in August 2025")
        self.assertEqual(kept(16, "2025-01-01"), [True, False, True], "account 16 returns in June 2025 and is retained at month 6")
        returning = self.con.execute(f"""SELECT s.subscription_id, s.account_id FROM {CE}.subscriptions s
            WHERE s.start_date BETWEEN DATE '2025-01-01' AND DATE '2025-09-30'
              AND EXISTS (SELECT 1 FROM {CE}.subscriptions p WHERE p.account_id = s.account_id AND p.start_date < s.start_date) ORDER BY 1""").fetchall()
        self.assertEqual(returning, [(24, 16), (25, 12), (26, 6)], "comebacks start subscriptions in 2025 but no new cohort")
        self.assertEqual(self.col(f"SELECT DISTINCT event_type FROM {CE}.subscription_events WHERE subscription_id IN (24, 25, 26)"), ["reactivation"])

    def test_saas_05_month_6_after_the_last_month_of_data(self):
        late = [m for m, _ in self.cohorts() if m.month + 6 > 12]
        self.assertEqual(late, [d("2025-07-01"), d("2025-08-01"), d("2025-09-01")], "their month 6 falls in 2026")
        self.assertEqual(self.one(f"SELECT max(month) FROM {CE}.mrr_monthly")[0], d("2025-12-01"), "the data ends in December 2025")

    def test_saas_05_costs_in_every_month_sized_so_gross_margin_and_payback_are_plain_numbers(self):
        for table in ("cogs_monthly", "marketing_spend_monthly", "sm_expense_monthly"):
            self.assertEqual(self.col(f"SELECT DISTINCT month FROM {CE}.{table} ORDER BY 1"), months("2024-01-01", "2025-12-01"), table)
        shared = self.col(f"SELECT DISTINCT cost_type FROM {CE}.sm_expense_monthly WHERE channel = 'shared' ORDER BY 1")
        self.assertEqual(shared, ["salaries", "tools"], "the shared rows")
        rows = self.con.execute(f"""WITH r AS (SELECT month, sum(mrr_eur) AS revenue FROM {CE}.mrr_monthly GROUP BY 1),
                 g AS (SELECT month, sum(amount_eur) AS cogs FROM {CE}.cogs_monthly GROUP BY 1),
                 p AS (SELECT month, sum(spend_eur) AS media FROM {CE}.marketing_spend_monthly GROUP BY 1),
                 o AS (SELECT month, sum(amount_eur) AS other FROM {CE}.sm_expense_monthly GROUP BY 1),
                 n AS (SELECT CAST(date_trunc('month', a.created_at) AS DATE) AS month, sum(m.mrr_eur) AS new_mrr FROM {CE}.accounts a
                       JOIN {CE}.mrr_monthly m ON m.account_id = a.account_id AND m.month = CAST(date_trunc('month', a.created_at) AS DATE)
                       WHERE a.created_at >= TIMESTAMP '2025-01-01' AND a.created_at < TIMESTAMP '2025-10-01' GROUP BY 1)
            SELECT n.month, (r.revenue - g.cogs) / r.revenue, (p.media + o.other) / (n.new_mrr * (r.revenue - g.cogs) / r.revenue)
            FROM n JOIN r USING (month) JOIN g USING (month) JOIN p USING (month) JOIN o USING (month) ORDER BY 1""").fetchall()
        self.assertEqual([m for m, *_ in rows], [m for m, _ in self.cohorts()], "each cohort month has revenue and every cost")
        for month, margin, payback in rows:
            with self.subTest(month=str(month)):
                self.assertTrue(0.5 < margin < 0.9, "a positive gross margin")
                self.assertTrue(1 < payback < 60, "a payback of a plain number of months")

    # ---- CASE-MKT-05: leads created in January to June 2025, later stages up to the last day of data -----------------------------

    def funnel(self):
        return self.con.execute(f"""SELECT l.source, count(*), count(o.opportunity_id), count(*) FILTER (WHERE o.is_won),
                   (SELECT count(*) FROM {CE}.marketing_spend_monthly s WHERE s.channel = l.source AND s.month BETWEEN DATE '2025-01-01' AND DATE '2025-06-01')
            FROM {CE}.leads l LEFT JOIN {CE}.opportunities o USING (lead_id) WHERE {H1_LEADS} GROUP BY 1 ORDER BY 1""").fetchall()

    def test_mkt_05_sources_with_no_spend_and_with_no_won_deal(self):
        funnel = self.funnel()
        self.assertEqual(len(funnel), 8, "eight sources have leads in the first half of 2025")
        self.assertEqual([s for s, *_, spend in funnel if spend == 0], ["organic", "outbound", "partner"], "no paid media")
        self.assertEqual([s for s, _, _, won, _ in funnel if won == 0], ["display", "outbound", "partner"], "leads and no won deal")
        self.assertEqual([s for s, _, _, won, spend in funnel if won == 0 and spend > 0], ["display"], "spend and no won deal")
        self.assertEqual([s for s, _, opps, *_ in funnel if opps == 0], ["partner"], "leads and no opportunity")
        self.assertTrue(all(won > 0 for s, _, _, won, _ in funnel if s in ("events", "paid_search", "paid_social", "review_sites")),
                        "the other paid sources each have a won deal")

    def test_mkt_05_an_opportunity_after_june_and_leads_with_none(self):
        late = self.con.execute(f"""SELECT l.lead_id, o.opportunity_id, CAST(o.created_at AS DATE), CAST(o.closed_at AS DATE), o.is_won
            FROM {CE}.leads l JOIN {CE}.opportunities o USING (lead_id)
            WHERE {H1_LEADS} AND (o.created_at >= TIMESTAMP '2025-07-01' OR o.closed_at >= TIMESTAMP '2025-07-01')""").fetchall()
        self.assertEqual(late, [(22, 19, d("2025-07-01"), d("2025-07-15"), True)], "a June lead's opportunity is created and won in July 2025")
        none = self.col(f"""SELECT lead_id FROM {CE}.leads l WHERE {H1_LEADS}
                            AND NOT EXISTS (SELECT 1 FROM {CE}.opportunities o WHERE o.lead_id = l.lead_id) ORDER BY 1""")
        self.assertEqual(none, [14, 15, 16], "leads with no opportunity")
        self.assertEqual(self.col(f"SELECT lead_id FROM {CE}.leads WHERE email = (SELECT email FROM {CE}.leads WHERE lead_id = 15) ORDER BY 1"), [15, 16],
                         "two leads with one email are two leads")
        self.assertEqual(self.col(f"SELECT opportunity_id FROM {CE}.opportunities WHERE closed_at IS NULL"), [17], "an opportunity still open")
        outside = self.one(f"""SELECT count(*) FILTER (WHERE created_at < TIMESTAMP '2025-01-01'), count(*) FILTER (WHERE created_at >= TIMESTAMP '2025-07-01')
                               FROM {CE}.leads""")
        self.assertTrue(outside[0] > 0 and outside[1] > 0, "leads before and after the half year")

    # ---- the six cases' keys on the edge: P16 and the CP3 references ----------------------------------------------------------------

    def run_on_edge(self, sql):
        """A key's rows on the edge, or the error's class name only: an engine message can quote the query."""
        self.con.execute(f"SET search_path = '{CE}'")
        try:
            return self.con.execute(sql).fetchall()
        except duckdb.Error as e:
            return type(e).__name__
        finally:
            self.con.execute("SET search_path = 'main'")

    def test_every_truth_query_gives_one_number_and_every_cp3_reference_returns_rows(self):
        numbers, rows = {}, {}
        for case_id in CASES:
            truths = json.loads((ROOT / "content" / "keys" / "cases" / f"{case_id}.json").read_text(encoding="utf-8"))["truths"]
            for checkpoint in ("CP2", "CP4"):
                got = self.run_on_edge(truths[checkpoint])
                ok = isinstance(got, list) and len(got) == 1 and len(got[0]) == 1 and got[0][0] is not None and not isinstance(got[0][0], (str, bool))
                numbers[f"{case_id}:{checkpoint}"] = "one number" if ok else (got if isinstance(got, str) else f"{len(got)} rows")
            record = json.loads((ROOT / "content" / "sql" / "cases" / f"{case_id}.json").read_text(encoding="utf-8"))
            item_id = next(c["item_id"] for c in record["checkpoints"] if c["kind"] == "CP3")
            reference = json.loads((ROOT / "content" / "keys" / "sql" / f"{item_id}.json").read_text(encoding="utf-8"))["reference_sql"]
            got = self.run_on_edge(reference)
            rows[item_id] = len(got) if isinstance(got, list) else got
        self.assertEqual({k for k, v in numbers.items() if v != "one number"}, set(), f"P16 on {CE}: {numbers}")
        self.assertTrue(all(isinstance(n, int) and n >= 1 for n in rows.values()), f"rows each CP3 reference returns on {CE}: {rows}")

    # ---- the rows follow LedgerLoop's rules (S8-02, S8-03, S8-05) --------------------------------------------------------------------

    def test_rows_follow_ledgerloops_rules(self):
        s = CE
        checks = {
            "a subscription whose MRR at a month end is not positive exactly while it is active": f"""SELECT count(*) FROM {s}.subscriptions x,
                (SELECT CAST(range + INTERVAL 1 MONTH - INTERVAL 1 DAY AS DATE) AS d FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH)) m
                WHERE ((SELECT coalesce(sum(e.mrr_delta_local), 0) FROM {s}.subscription_events e WHERE e.subscription_id = x.subscription_id
                        AND e.event_date <= m.d) > 0) <> (x.start_date <= m.d AND (x.end_date IS NULL OR x.end_date > m.d))""",
            "an mrr_local that is not the MRR at the end or on the as-of date": f"""SELECT count(*) FROM {s}.subscriptions x
                JOIN (SELECT subscription_id, sum(mrr_delta_local) AS total, sum(mrr_delta_local) FILTER (WHERE event_type <> 'churn') AS before_end
                      FROM {s}.subscription_events GROUP BY 1) e USING (subscription_id)
                WHERE (x.end_date IS NULL AND e.total <> x.mrr_local) OR (x.end_date IS NOT NULL AND (e.total <> 0 OR e.before_end <> x.mrr_local))""",
            "an opening event off 2024-01-01, or a subscription active that day without one": f"""SELECT
                (SELECT count(*) FROM {s}.subscription_events WHERE event_type = 'opening' AND event_date <> DATE '2024-01-01')
                + (SELECT count(*) FROM {s}.subscriptions x WHERE x.start_date <= DATE '2024-01-01' AND (x.end_date IS NULL OR x.end_date > DATE '2024-01-01')
                   AND NOT EXISTS (SELECT 1 FROM {s}.subscription_events e WHERE e.subscription_id = x.subscription_id AND e.event_type = 'opening'))""",
            "an account created in the window without exactly one new event on its created day": f"""SELECT count(*) FROM {s}.accounts a
                WHERE a.created_at >= TIMESTAMP '2024-01-01' AND (SELECT count(*) FROM {s}.subscription_events e WHERE e.account_id = a.account_id
                      AND e.event_type = 'new' AND e.event_date = CAST(a.created_at AS DATE)) <> 1""",
            "a new event of an account created before 2024": f"""SELECT count(*) FROM {s}.subscription_events e JOIN {s}.accounts a USING (account_id)
                WHERE e.event_type = 'new' AND a.created_at < TIMESTAMP '2024-01-01'""",
            "a subscription that does not start with one opening, new or reactivation event": f"""SELECT count(*) FROM (SELECT event_type,
                row_number() OVER (PARTITION BY subscription_id ORDER BY event_date, event_id) AS k FROM {s}.subscription_events)
                WHERE (k = 1) <> (event_type IN ('opening', 'new', 'reactivation'))""",
            "an up that is not positive or a down that is not negative": f"""SELECT count(*) FROM {s}.subscription_events
                WHERE (event_type IN ('opening', 'new', 'expansion', 'reactivation') AND mrr_delta_local <= 0)
                   OR (event_type IN ('contraction', 'churn') AND mrr_delta_local >= 0)""",
            "a churn that is not the subscription's end, or an end with no churn": f"""SELECT count(*) FROM {s}.subscriptions x
                LEFT JOIN {s}.subscription_events e ON e.subscription_id = x.subscription_id AND e.event_type = 'churn'
                WHERE (x.end_date IS NULL) <> (e.event_id IS NULL) OR e.event_date <> x.end_date""",
            "a reactivation that does not follow a churned subscription of its account": f"""SELECT count(*) FROM {s}.subscription_events e
                JOIN {s}.subscriptions x USING (subscription_id) WHERE e.event_type = 'reactivation' AND NOT EXISTS (SELECT 1 FROM {s}.subscriptions p
                WHERE p.account_id = x.account_id AND p.end_date IS NOT NULL AND p.end_date <= x.start_date)""",
            "an event of another account than its subscription's, or off the subscription's start day of the month": f"""SELECT count(*)
                FROM {s}.subscription_events e JOIN {s}.subscriptions x USING (subscription_id)
                WHERE e.account_id <> x.account_id OR (e.event_type <> 'opening' AND day(e.event_date) <> day(x.start_date))""",
            "a currency that is not the country's": f"""SELECT count(*) FROM {s}.subscriptions x JOIN {s}.accounts a USING (account_id)
                WHERE x.currency <> CASE a.country_code WHEN 'GB' THEN 'GBP' WHEN 'CH' THEN 'CHF' ELSE 'EUR' END""",
            "two subscriptions of one account at once": f"""SELECT count(*) FROM {s}.subscriptions a JOIN {s}.subscriptions b ON a.account_id = b.account_id
                AND a.subscription_id < b.subscription_id AND b.start_date < coalesce(a.end_date, DATE '9999-12-31')
                AND a.start_date < coalesce(b.end_date, DATE '9999-12-31')""",
            "a subscription or event of an account or plan that does not exist": f"""SELECT
                (SELECT count(*) FROM {s}.subscriptions x WHERE x.account_id NOT IN (SELECT account_id FROM {s}.accounts)
                 OR x.plan_id NOT IN (SELECT plan_id FROM {s}.plans) OR x.billing_period <> 'monthly')
                + (SELECT count(*) FROM {s}.subscription_events e WHERE e.subscription_id NOT IN (SELECT subscription_id FROM {s}.subscriptions))""",
            "a won opportunity without its account, an account with no won opportunity, or a lost one with an account": f"""SELECT
                (SELECT count(*) FROM {s}.opportunities o LEFT JOIN {s}.accounts a USING (account_id)
                 WHERE (o.is_won IS TRUE) <> (o.account_id IS NOT NULL) OR (o.is_won AND (a.account_id IS NULL OR a.created_at < o.closed_at)))
                + (SELECT count(*) FROM {s}.accounts a WHERE a.created_at >= TIMESTAMP '2024-01-01'
                   AND (SELECT count(*) FROM {s}.opportunities o WHERE o.account_id = a.account_id) <> 1)
                + (SELECT count(*) FROM {s}.opportunities WHERE (closed_at IS NULL) <> (is_won IS NULL) OR closed_at < created_at)
                + (SELECT count(*) FROM {s}.opportunities o JOIN {s}.leads l USING (lead_id) WHERE o.created_at < l.created_at)
                + (SELECT count(*) - count(DISTINCT lead_id) FROM {s}.opportunities)
                + (SELECT count(*) FROM {s}.opportunities WHERE lead_id NOT IN (SELECT lead_id FROM {s}.leads))
                + (SELECT count(*) FROM {s}.opportunities o JOIN {s}.leads l USING (lead_id) JOIN {s}.accounts a USING (account_id)
                   WHERE a.acquisition_channel <> l.source OR a.segment <> l.segment)
                + (SELECT count(*) FROM {s}.opportunities WHERE is_won AND stage <> 'contract')""",
            "a lead source that is not a paid channel or one of the unpaid ones": f"""SELECT count(*) FROM {s}.leads WHERE source NOT IN
                (SELECT DISTINCT channel FROM {s}.marketing_spend_monthly) AND source NOT IN ('organic', 'outbound', 'partner', 'referral')""",
            "a dated row outside 2024 and 2025, or a test account": f"""SELECT
                (SELECT count(*) FROM {s}.subscription_events WHERE event_date NOT BETWEEN DATE '{WINDOW[0]}' AND DATE '{WINDOW[1]}')
                + (SELECT count(*) FROM {s}.leads WHERE CAST(created_at AS DATE) NOT BETWEEN DATE '{WINDOW[0]}' AND DATE '{WINDOW[1]}')
                + (SELECT count(*) FROM {s}.opportunities WHERE CAST(coalesce(closed_at, created_at) AS DATE) NOT BETWEEN DATE '{WINDOW[0]}' AND DATE '{WINDOW[1]}')
                + (SELECT count(*) FROM {s}.accounts WHERE is_test OR account_name ILIKE '%test%' OR created_at >= TIMESTAMP '2026-01-01')""",
        }
        for what, sql in checks.items():
            with self.subTest(check=what):
                self.assertEqual(self.one(sql)[0], 0, what)
        fx = self.con.execute(f"""SELECT currency, count(*), min(rate_date), max(rate_date) FROM {s}.fx_rates GROUP BY 1 ORDER BY 1""").fetchall()
        self.assertEqual(fx, [(c, 731, d(WINDOW[0]), d(WINDOW[1])) for c in ("CHF", "EUR", "GBP")], "every day of the window per currency")
        self.assertEqual(self.one(f"SELECT count(*) FROM {s}.fx_rates WHERE currency = 'EUR' AND eur_per_unit <> 1")[0], 0)
        self.assertEqual(self.one(f"SELECT min(eur_per_unit) > 0 FROM {s}.fx_rates")[0], True)
        self.assertEqual(set(self.col(f"SELECT DISTINCT segment FROM {s}.accounts")), {"SMB", "Mid-Market", "Enterprise"}, "the clean spellings")
        self.assertEqual(self.con.execute(f"SELECT * FROM {s}.plans ORDER BY 1").fetchall(),
                         self.con.execute("SELECT * FROM ledgerloop.plans ORDER BY 1").fetchall(), "ledgerloop's plan catalogue")
        for table, column in (("marketing_spend_monthly", "spend_eur"), ("cogs_monthly", "amount_eur"), ("sm_expense_monthly", "amount_eur")):
            self.assertEqual(self.one(f"SELECT count(*) FROM {s}.{table} WHERE {column} <= 0 OR day(month) <> 1")[0], 0, table)

    # ---- its description ------------------------------------------------------------------------------------------------------------

    def test_the_description_lists_each_plant_under_its_tables(self):
        desc = json.loads((ROOT / "content" / "sql" / "edge" / f"{CE}.json").read_text(encoding="utf-8"))
        tables, views = self.names(CE)
        self.assertEqual((desc["schema"], desc["mirrors"], desc["family"]), (CE, "ledgerloop", "saas"))
        self.assertEqual(len(set(desc["contains"])), len(desc["contains"]), "no line twice")
        self.assertTrue(desc["tables"] and set(desc["tables"]) <= tables | views, sorted(set(desc["tables"]) - tables - views))
        listed = [line for lines in desc["tables"].values() for line in lines]
        self.assertEqual(set(listed) - set(desc["contains"]), set(), "every table line is a contains line")
        for line in desc["contains"]:
            under = {t for t, lines in desc["tables"].items() if line in lines}
            self.assertTrue(under & tables, f"each line sits under a table the edge file creates: line {desc['contains'].index(line) + 1}")
        for table, lines in desc["tables"].items():
            self.assertEqual(lines, [x for x in desc["contains"] if x in lines], f"{table}: lines once each, in their order")
        self.assertFalse(set(desc["tables"]) & EMPTY, "no line about a table with no row")
        text = " ".join(desc["contains"])
        for word in ("falls in March 2025", "CHF", "GBP", "December 2024 only", "March, May and August 2025", "comes back in June 2025",
                     "17 June 2025", "reactivation", "January 2024", "September 2024", "above", "October 2024", "cohort", "month 6",
                     "shared", "no paid media", "no won deal", "1 July", "no opportunity", "same email", "still open"):
            self.assertIn(word, text, f"a line about the plant: {word}")
        raw = json.dumps(desc, ensure_ascii=False)
        self.assertNotIn("—", raw, "no em dash")
        self.assertNotIn("NULL", raw, "missing, not NULL")
        self.assertNotRegex(raw, r"(?i)\b(he|she|him|her|his|hers)\b", "no gendered pronoun")


if __name__ == "__main__":
    unittest.main()

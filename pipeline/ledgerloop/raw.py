"""LedgerLoop's raw quirks (knowledge/05 CO-02 Q-02-01 to -07; sprint 8, S8-01; GEN-04, GEN-06).

The clean tables are generated first; this step copies the quirk tables and injects each quirk into the copy, so no clean table
changes. Every draw comes from the reserved quirks stream, in the order below. ledgerloop_raw holds a copy of every clean table:
the quirk tables with their quirks, unchanged copies of the rest (S8-01).

- Q-02-01: webhook retries send about 210 subscription events twice (FIND-02-13's band is 180 to 240; S8-04 makes that about 7% of
  the events, not 05's 1.5%). Each copy repeats an event's business key under a new event_id after the last clean one, recorded
  seconds to minutes after it; three in four are expansions, so the copies inflate expansion MRR.
- Q-02-02: 6% of churn events are recorded more than 30 days after their event_date (backdated cancellations), always by
  2025-12-31; clean records every event on its day, so FIND-02-12's reported and restated MRR differ on raw only.
- Q-02-03: the billing export labels every amount EUR, so GBP and CHF amounts sit there unconverted (subscriptions, invoices).
- Q-02-04: payment attempts are the provider's UTC instants (TIMESTAMPTZ); clean holds them as Brussels local TIMESTAMP, like
  every other clean time.
- Q-02-05: 4% of running subscriptions end on the sentinel 9999-12-31 instead of a missing end_date.
- Q-02-06: segment spellings "SMB", "smb", "Small Business", "Mid-Market", "midmarket" (Enterprise keeps one).
- Q-02-07: 25 internal test accounts appended after the last clean account: some flagged is_test, some named like '%test%' but
  not flagged. They hold no subscription.
"""
from __future__ import annotations

import datetime as dt

import duckdb
import numpy as np
import pyarrow as pa

from . import generate as ll

RAW_TABLES = ll.CLEAN_TABLES                               # S8-01: a copy of every table
QUIRK_TABLES = ("accounts", "subscriptions", "subscription_events", "invoices", "payments")
UNCHANGED = tuple(t for t in RAW_TABLES if t not in QUIRK_TABLES)
DUPLICATES = 210                                           # Q-02-01, FIND-02-13 (180 to 240)
DUPLICATE_MIX = (("expansion", 0.75), ("new", 0.08), ("contraction", 0.07), ("reactivation", 0.04), ("churn", 0.06))
LATE_CHURN = 0.06                                          # Q-02-02
LATE_DAYS = (31, 120)
SENTINEL = dt.date(9999, 12, 31)                           # Q-02-05
SENTINEL_SHARE = 0.04
SPELLINGS = {"SMB": (("SMB", 0.60), ("smb", 0.20), ("Small Business", 0.20)),
             "Mid-Market": (("Mid-Market", 0.65), ("midmarket", 0.35))}       # Q-02-06
TEST_ACCOUNTS = (   # Q-02-07: name, is_test, country, segment
    ("LedgerLoop Demo NL", True, "NL", "SMB"), ("LedgerLoop Demo DE", True, "DE", "SMB"), ("Sales Sandbox 01", True, "BE", "Mid-Market"),
    ("Sales Sandbox 02", True, "BE", "Mid-Market"), ("QA Automation Account", True, "NL", "SMB"), ("Internal Finance Team", True, "BE", "SMB"),
    ("Partner Training Workspace", True, "DE", "Mid-Market"), ("Onboarding Template", True, "NL", "SMB"),
    ("Test Account Enterprise", True, "DE", "Enterprise"), ("Load Test 2024", True, "NL", "SMB"), ("Support Repro Workspace", True, "FR", "SMB"),
    ("Billing Test GBP", True, "GB", "SMB"), ("Billing Test CHF", True, "CH", "SMB"), ("Demo Ltd (sales)", True, "GB", "Mid-Market"),
    ("Release Candidate Check", True, "NL", "SMB"),
    ("Test Company B.V.", False, "NL", "SMB"), ("test account do not bill", False, "BE", "smb"), ("Testbedrijf Gent", False, "BE", "SMB"),
    ("ACME Test GmbH", False, "DE", "Mid-Market"), ("zz_test_fr", False, "FR", "SMB"), ("Test Treuhand AG", False, "CH", "SMB"),
    ("UAT test Ltd", False, "GB", "Small Business"), ("Integration TEST", False, "DE", "midmarket"), ("Mollie test merchant", False, "NL", "SMB"),
    ("Pentest 2025", False, "NL", "SMB"),
)


def inject_quirks(rng: np.random.Generator, clean: dict, payments_utc: np.ndarray) -> tuple[dict, dict]:
    """The raw tables and each quirk's counts for the truth file's planted.raw."""
    planted = {}
    raw = {name: clean[name] for name in UNCHANGED}
    raw["accounts"], planted["Q-02-06"], planted["Q-02-07"] = raw_accounts(rng, clean["accounts"])
    raw["subscriptions"], planted["Q-02-03"], planted["Q-02-05"] = raw_subscriptions(rng, clean["subscriptions"])
    raw["subscription_events"], planted["Q-02-01"], planted["Q-02-02"] = raw_events(rng, clean["subscription_events"])
    raw["invoices"] = clean["invoices"].set_column(clean["invoices"].schema.get_field_index("currency"), "currency",
                                                   pa.array(["EUR"] * clean["invoices"].num_rows, pa.string()))
    planted["Q-02-03"]["invoices"] = int(sum(1 for c in clean["invoices"].column("currency").to_pylist() if c != "EUR"))
    payments = clean["payments"]
    raw["payments"] = payments.set_column(payments.schema.get_field_index("attempted_at"), "attempted_at", ll.utc_ts(payments_utc))
    planted["Q-02-04"] = {"count": payments.num_rows, "type": "TIMESTAMPTZ", "zone": "UTC"}
    return {name: raw[name] for name in RAW_TABLES}, planted


def raw_accounts(rng: np.random.Generator, accounts: pa.Table) -> tuple[pa.Table, dict, dict]:
    """Q-02-06's spellings, then Q-02-07's test accounts appended."""
    segments = accounts.column("segment").to_pylist()
    respelled = []
    for s in segments:
        options = SPELLINGS.get(s)
        respelled.append(options[int(ll.pick(rng, options, 1)[0])][0] if options else s)
    changed = sum(1 for a, b in zip(segments, respelled) if a != b)
    table = accounts.set_column(accounts.schema.get_field_index("segment"), "segment", pa.array(respelled, pa.string()))
    first = int(max(accounts.column("account_id").to_pylist())) + 1
    n = len(TEST_ACCOUNTS)
    created = [ll.seconds(dt.date(2023, 6, 1) + dt.timedelta(int(rng.integers(0, 900)))) + int(rng.integers(9 * 3600, 17 * 3600))
               for _ in range(n)]
    tests = pa.table({
        "account_id": pa.array(range(first, first + n), pa.int32()),
        "account_name": pa.array([t[0] for t in TEST_ACCOUNTS], pa.string()),
        "country_code": pa.array([t[2] for t in TEST_ACCOUNTS], pa.string()),
        "segment": pa.array([t[3] for t in TEST_ACCOUNTS], pa.string()),
        "employee_band": pa.array(["1-10"] * n, pa.string()),
        "industry": pa.array(["technology"] * n, pa.string()),
        "acquisition_channel": pa.array(["organic"] * n, pa.string()),
        "created_at": ll.local_ts(created),
        "is_test": pa.array([t[1] for t in TEST_ACCOUNTS], pa.bool_()),
    })
    return (pa.concat_tables([table, tests]),
            {"count": changed, "spellings": sorted({v for opts in SPELLINGS.values() for v, _ in opts})},
            {"count": n, "flagged": sum(1 for t in TEST_ACCOUNTS if t[1]), "first_new_id": first})


def raw_subscriptions(rng: np.random.Generator, subs: pa.Table) -> tuple[pa.Table, dict, dict]:
    """Q-02-03's currency label, then Q-02-05's sentinel end dates."""
    currency = subs.column("currency").to_pylist()
    table = subs.set_column(subs.schema.get_field_index("currency"), "currency", pa.array(["EUR"] * subs.num_rows, pa.string()))
    ends = subs.column("end_date").to_pylist()
    running = [i for i, e in enumerate(ends) if e is None]
    chosen = set(int(i) for i in rng.choice(running, size=int(round(SENTINEL_SHARE * len(running))), replace=False))
    ends = [SENTINEL if i in chosen else e for i, e in enumerate(ends)]
    table = table.set_column(table.schema.get_field_index("end_date"), "end_date", pa.array(ends, pa.date32()))
    return (table, {"count": sum(1 for c in currency if c != "EUR"), "labelled": "EUR"},
            {"count": len(chosen), "share": SENTINEL_SHARE, "sentinel": SENTINEL.isoformat()})


def raw_events(rng: np.random.Generator, events: pa.Table) -> tuple[pa.Table, dict, dict]:
    """Q-02-02's late churn records, then Q-02-01's duplicates appended."""
    kinds = events.column("event_type").to_pylist()
    days = events.column("event_date").to_pylist()
    recorded = [int((x - dt.datetime(1970, 1, 1)).total_seconds()) for x in events.column("recorded_at").to_pylist()]
    churns = [i for i, k in enumerate(kinds) if k == "churn"]
    eligible = [i for i in churns if days[i] + dt.timedelta(LATE_DAYS[0]) <= ll.WINDOW_END]
    late = sorted(int(i) for i in rng.choice(eligible, size=int(round(LATE_CHURN * len(churns))), replace=False))
    for i in late:
        room = (ll.WINDOW_END - days[i]).days
        lag = int(rng.integers(LATE_DAYS[0], min(LATE_DAYS[1], room) + 1))
        recorded[i] = ll.seconds(days[i] + dt.timedelta(lag)) + int(rng.integers(8 * 3600, 18 * 3600))
    late_set = set(late)
    by_kind = {k: [i for i, x in enumerate(kinds) if x == k and i not in late_set] for k, _ in DUPLICATE_MIX}
    picks = []
    counts = np.bincount(ll.pick(rng, DUPLICATE_MIX, DUPLICATES), minlength=len(DUPLICATE_MIX))
    for (kind, _), n in zip(DUPLICATE_MIX, counts):
        picks += [int(i) for i in rng.choice(by_kind[kind], size=int(n), replace=False)]
    picks.sort()
    table = events.set_column(events.schema.get_field_index("recorded_at"), "recorded_at", ll.local_ts(recorded))
    first = int(max(events.column("event_id").to_pylist())) + 1
    copies = table.take(pa.array(picks))
    copy_recorded = [recorded[i] + int(rng.integers(5, 1200)) for i in picks]
    copies = copies.set_column(0, "event_id", pa.array(range(first, first + len(picks)), pa.int64()))
    copies = copies.set_column(copies.schema.get_field_index("recorded_at"), "recorded_at", ll.local_ts(copy_recorded))
    return (pa.concat_tables([table, copies]),
            {"count": len(picks), "expansion": int(sum(1 for i in picks if kinds[i] == "expansion")), "first_new_id": first},
            {"count": len(late), "share": LATE_CHURN, "days_late": list(LATE_DAYS)})


def validate(tables: dict, truth: dict) -> dict:
    """GEN-06 for the quirks: each exists in raw, with the count the truth records, and not in clean, measured in SQL. Returns the
    measures (truth findings.raw). Raises ValueError naming the quirk on the first failure; no message carries a measured value."""
    clean, raw = tables["clean"], tables["raw"]
    planted = truth["planted"]["raw"]
    con = duckdb.connect(config=ll.NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    try:
        for prefix, source in (("c", clean), ("r", raw)):
            for name, table in source.items():
                con.register(f"{prefix}_{name}", table)

        def one(sql):
            return con.execute(sql).fetchone()

        dupes, clean_dupes, extra = one("""SELECT
                (SELECT coalesce(sum(n - 1), 0) FROM (SELECT count(*) AS n FROM r_subscription_events
                 GROUP BY subscription_id, event_type, event_date, mrr_delta_local HAVING count(*) > 1)),
                (SELECT count(*) FROM (SELECT 1 FROM c_subscription_events GROUP BY subscription_id, event_type, event_date, mrr_delta_local
                 HAVING count(*) > 1)),
                (SELECT count(*) FROM r_subscription_events) - (SELECT count(*) FROM c_subscription_events)""")
        late, churns, clean_late = one("""SELECT
                (SELECT count(*) FROM r_subscription_events r JOIN c_subscription_events c USING (event_id)
                 WHERE r.event_type = 'churn' AND r.recorded_at > r.event_date + INTERVAL 30 DAY),
                (SELECT count(*) FROM c_subscription_events WHERE event_type = 'churn'),
                (SELECT count(*) FROM c_subscription_events WHERE CAST(recorded_at AS DATE) <> event_date)""")
        mislabelled, foreign, raw_currencies, same_amounts = one("""SELECT
                (SELECT count(*) FROM r_subscriptions r JOIN c_subscriptions c USING (subscription_id) WHERE r.currency = 'EUR' AND c.currency <> 'EUR'),
                (SELECT count(*) FROM c_subscriptions WHERE currency <> 'EUR'),
                (SELECT count(DISTINCT currency) FROM r_subscriptions) + (SELECT count(DISTINCT currency) FROM r_invoices),
                (SELECT count(*) FROM r_invoices r JOIN c_invoices c USING (invoice_id) WHERE r.amount_local = c.amount_local)""")
        shifted, zoned = one("""SELECT
                (SELECT count(*) FROM r_payments r JOIN c_payments c USING (payment_id) WHERE timezone('Europe/Brussels', r.attempted_at) = c.attempted_at),
                (SELECT count(*) FROM (DESCRIBE r_payments) WHERE column_name = 'attempted_at' AND column_type = 'TIMESTAMP WITH TIME ZONE')""")
        sentinel, running, clean_sentinel = one("""SELECT
                (SELECT count(*) FROM r_subscriptions r JOIN c_subscriptions c USING (subscription_id) WHERE c.end_date IS NULL AND r.end_date = DATE '9999-12-31'),
                (SELECT count(*) FROM c_subscriptions WHERE end_date IS NULL),
                (SELECT count(*) FROM c_subscriptions WHERE end_date = DATE '9999-12-31')""")
        respelled, raw_spellings, clean_spellings = one("""SELECT
                (SELECT count(*) FROM r_accounts r JOIN c_accounts c USING (account_id) WHERE r.segment <> c.segment),
                (SELECT count(DISTINCT segment) FROM r_accounts), (SELECT count(DISTINCT segment) FROM c_accounts)""")
        tests, flagged, named, clean_tests = one("""SELECT count(*), count(*) FILTER (WHERE is_test),
                count(*) FILTER (WHERE NOT is_test AND account_name ILIKE '%test%'),
                (SELECT count(*) FROM c_accounts WHERE is_test OR account_name ILIKE '%test%')
            FROM r_accounts WHERE account_id NOT IN (SELECT account_id FROM c_accounts)""")
    finally:
        con.close()
    ll._check(dupes == extra == planted["Q-02-01"]["count"] and 180 <= dupes <= 240 and clean_dupes == 0,
              "Q-02-01: raw holds the planted duplicate events, clean none")
    ll._check(late == planted["Q-02-02"]["count"] > 0 and 0.05 <= late / churns <= 0.07 and clean_late == 0,
              "Q-02-02: about 6% of raw churn events recorded over 30 days late, none in clean")
    ll._check(mislabelled == foreign == planted["Q-02-03"]["count"] > 0 and raw_currencies == 2
              and same_amounts == clean["invoices"].num_rows, "Q-02-03: raw labels every GBP and CHF amount EUR, unconverted")
    ll._check(zoned == 1 and shifted == clean["payments"].num_rows == planted["Q-02-04"]["count"],
              "Q-02-04: raw payments are the UTC instants of clean's Brussels times")
    ll._check(sentinel == planted["Q-02-05"]["count"] > 0 and 0.03 <= sentinel / running <= 0.05 and clean_sentinel == 0,
              "Q-02-05: about 4% of running subscriptions end on 9999-12-31 in raw, none in clean")
    ll._check(respelled == planted["Q-02-06"]["count"] > 0 and raw_spellings == 6 and clean_spellings == 3,
              "Q-02-06: raw spells the segments five ways plus Enterprise, clean three ways")
    ll._check(tests == planted["Q-02-07"]["count"] == 25 and flagged > 0 and named > 0 and clean_tests == 0,
              "Q-02-07: 25 test accounts in raw, some flagged and some only named as tests, none in clean")
    ll._check(all(raw[name].equals(clean[name]) for name in UNCHANGED), "raw's unchanged copies differ from clean")
    return {
        "Q-02-01": {"duplicate_events": int(dupes)},
        "Q-02-02": {"late_churn_events": int(late), "share": round(late / churns, 4)},
        "Q-02-03": {"subscriptions_labelled_eur": int(mislabelled)},
        "Q-02-04": {"payments_in_utc": int(shifted)},
        "Q-02-05": {"sentinel_end_dates": int(sentinel), "share": round(sentinel / running, 4)},
        "Q-02-06": {"respelled_accounts": int(respelled), "raw_spellings": int(raw_spellings)},
        "Q-02-07": {"test_accounts": int(tests), "flagged": int(flagged), "named_only": int(named)},
    }

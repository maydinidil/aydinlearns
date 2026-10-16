"""Mailvora's raw quirks (knowledge/05 CO-03 Q-03-01 to -07; sprint 6 Part 2, S6-20; rulings P31 to P34; GEN-04, GEN-06).

The clean tables are generated first; this step copies the quirk tables and injects each quirk into the copy, so no clean table
changes. Every draw comes from the reserved quirks stream, in the order below. mailvora_raw holds the quirk tables and unchanged
copies of payments, channels, campaigns and fx_rates_monthly (P31), and of signups (P37), so FIND-03-11 can be computed on
mailvora_raw alone.

- Q-03-01: a Meta session's utm_source is one of five spellings ("facebook", "Facebook", "fb", "meta", "ig") and its
  utm_medium one of "paid_social", "Paid-Social", "cpc"; clean has "facebook" and "paid_social" only (P34).
- Q-03-02 (P33): a LinkedIn row's spend_date is the Los Angeles date on which its UTC day began, the day before, with
  export_timezone 'America/Los_Angeles'. Spend has no hour (E-086), so the quirk is the day label; the rule a learner applies is
  notes.LA_DAY_RULE.
- Q-03-03: a LinkedIn row's spend is in US dollars (currency 'USD'), as LinkedIn billed it; clean holds its euros at the
  month's rate.
- Q-03-04: Meta's rows for 2025-07-14 and 07-15 are loaded twice (a re-import).
- Q-03-05: about 3% of raw sessions are bots, each a visitor_id with 200 or more sessions a day, appended under new
  session_ids after the last clean one (Q-01-01's pattern, P34).
- Q-03-06: 1% of sessions, all of them direct, hold empty strings in place of the missing UTM fields. The missing fields of
  direct sessions are a business state, in both schemas (P32).
- Q-03-07: 4% of payments are refunded. A business state, in both schemas (P32): raw payments is an unchanged copy.
"""
from __future__ import annotations

import datetime as dt

import duckdb
import numpy as np
import pyarrow as pa

from . import generate as mv

RAW_TABLES = ("channels", "campaigns", "ad_spend_daily", "fx_rates_monthly", "sessions", "signups", "payments")   # P31, P37
UNCHANGED = ("channels", "campaigns", "fx_rates_monthly", "signups", "payments")
META_SOURCES = (("facebook", 0.46), ("Facebook", 0.18), ("fb", 0.14), ("meta", 0.12), ("ig", 0.10))     # Q-03-01
META_MEDIUMS = (("paid_social", 0.70), ("Paid-Social", 0.18), ("cpc", 0.12))                           # Q-03-01
EMPTY_SHARE = 0.01                                        # Q-03-06
BOTS = {"share": 0.03, "visitors": 12, "days": 20, "per_day": (210, 311), "countries": ("NL", "DE", "IE"),
        "landing": ("/", "/pricing")}                     # Q-03-05: share of all raw sessions
LA = mv.PLANTS["linkedin_export"]["timezone"]
REIMPORT = [dt.date.fromisoformat(x) for x in mv.PLANTS["meta_reimport"]]
NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17


def inject_quirks(rng: np.random.Generator, clean: dict, ad: dict, session_channel: np.ndarray,
                  next_visitor: int) -> tuple[dict, dict]:
    """The raw tables and each quirk's counts for the truth file's planted.raw."""
    spend, planted = raw_ad_spend(clean["ad_spend_daily"], ad, clean["campaigns"])
    sessions, more = raw_sessions(rng, clean["sessions"], session_channel, next_visitor)
    planted.update(more)
    planted["Q-03-07"] = {"count": int(np.count_nonzero(clean["payments"].column("refunded").to_numpy(zero_copy_only=False))),
                          "share": mv.REFUND_SHARE, "note": "a business state, in both schemas (P32)"}
    raw = {name: clean[name] for name in UNCHANGED}
    raw["ad_spend_daily"], raw["sessions"] = spend, sessions
    return {name: raw[name] for name in RAW_TABLES}, planted


def raw_ad_spend(clean: pa.Table, ad: dict, campaigns: pa.Table) -> tuple[pa.Table, dict]:
    """Q-03-02 and Q-03-03 on LinkedIn's rows (no draw), then Q-03-04's re-imported Meta rows appended (no draw)."""
    li = ad["is_linkedin"]
    days = ad["day"] - li.astype(np.int64)                # P33: the Los Angeles date on which the UTC day began
    cents = clean.column("spend").cast(pa.float64()).to_numpy() * 100
    cents = np.where(li, ad["usd_cents"], np.round(cents)).astype(np.int64)
    table = clean.set_column(0, "spend_date", mv.dates(days))
    table = table.set_column(table.schema.get_field_index("spend"), "spend", mv.decimal_array(cents, 12, 2))
    table = table.set_column(table.schema.get_field_index("currency"), "currency",
                             pa.array(np.where(li, "USD", "EUR").tolist(), pa.string()))
    table = table.set_column(table.schema.get_field_index("export_timezone"), "export_timezone",
                             pa.array(np.where(li, LA, "UTC").tolist(), pa.string()))
    meta_ids = {cid for cid, ch in zip(campaigns.column("campaign_id").to_pylist(), campaigns.column("channel_id").to_pylist())
                if ch == mv.CHANNELS[mv.META][0]}
    reimport = {(x - mv.WINDOW_START).days for x in REIMPORT}
    again = np.flatnonzero(np.isin(ad["day"], list(reimport)) & np.isin(clean.column("campaign_id").to_numpy(), list(meta_ids)))
    table = pa.concat_tables([table, table.take(pa.array(again))])
    planted = {
        "Q-03-02": {"count": int(li.sum()), "export_timezone": LA, "day_shift": -1},
        "Q-03-03": {"count": int(li.sum()), "currency": "USD"},
        "Q-03-04": {"count": int(len(again)), "dates": [x.isoformat() for x in REIMPORT], "channel": "meta"},
    }
    return table, planted


def raw_sessions(rng: np.random.Generator, clean: pa.Table, channel: np.ndarray, next_visitor: int) -> tuple[pa.Table, dict]:
    """Q-03-01's spellings, then Q-03-06's empty strings, then Q-03-05's bots appended."""
    n = clean.num_rows
    source = np.array(clean.column("utm_source").to_pylist(), dtype=object)
    medium = np.array(clean.column("utm_medium").to_pylist(), dtype=object)
    campaign = np.array(clean.column("utm_campaign").to_pylist(), dtype=object)
    meta = np.flatnonzero(channel == mv.META)
    source[meta] = np.array([s for s, _ in META_SOURCES], dtype=object)[mv.pick(rng, META_SOURCES, len(meta))]
    medium[meta] = np.array([s for s, _ in META_MEDIUMS], dtype=object)[mv.pick(rng, META_MEDIUMS, len(meta))]
    respelled = int(np.count_nonzero((source[meta] != "facebook") | (medium[meta] != "paid_social")))
    direct = np.flatnonzero(channel == mv.DIR)
    empty = np.sort(rng.choice(direct, size=int(round(EMPTY_SHARE * n)), replace=False))
    source[empty] = medium[empty] = campaign[empty] = ""
    table = clean
    for name, values in (("utm_source", source), ("utm_medium", medium), ("utm_campaign", campaign)):
        table = table.set_column(table.schema.get_field_index(name), name, pa.array(values.tolist(), pa.string()))
    bots = bot_sessions(rng, n, next_visitor)
    planted = {
        "Q-03-01": {"count": respelled, "spellings": [s for s, _ in META_SOURCES], "mediums": [s for s, _ in META_MEDIUMS]},
        "Q-03-05": {"count": bots.num_rows, "visitors": BOTS["visitors"], "first_new_id": n + 1},
        "Q-03-06": {"count": int(len(empty)), "share_of_sessions": EMPTY_SHARE},
    }
    return pa.concat_tables([table, bots]), planted


def bot_sessions(rng: np.random.Generator, clean_rows: int, next_visitor: int) -> pa.Table:
    """Q-03-05: a dozen bots, each on 20 days with 210 to 310 sessions a day at different seconds, no UTM fields, scaled so they
    are BOTS['share'] of all raw sessions."""
    target = int(round(BOTS["share"] / (1 - BOTS["share"]) * clean_rows))
    plan = []
    for b in range(BOTS["visitors"]):
        for day in np.sort(rng.choice(mv.DAYS, size=BOTS["days"], replace=False)):
            plan.append((b, int(day), int(rng.integers(*BOTS["per_day"]))))
    scale = target / sum(k for _, _, k in plan)
    starts, who = [], []
    for b, day, k in plan:
        k = max(200, int(round(k * scale)))
        seconds = np.sort(rng.choice(86400, size=k, replace=False))
        starts.append((mv.DAY0 + day) * 86400 + seconds)
        who.append(np.full(k, b))
    start, who = np.concatenate(starts), np.concatenate(who)
    order = np.lexsort((who, start))
    start, who = start[order], who[order]
    country = np.array([BOTS["countries"][b % len(BOTS["countries"])] for b in who], dtype=object)
    landing = np.array(BOTS["landing"], dtype=object)[rng.integers(0, len(BOTS["landing"]), len(who))]
    missing = pa.nulls(len(who), pa.string())
    return pa.table({
        "session_id": pa.array(np.arange(clean_rows + 1, clean_rows + 1 + len(who)), pa.int64()),
        "visitor_id": pa.array([f"V{next_visitor + b:07d}" for b in who], pa.string()),
        "session_start": mv.timestamps(start),
        "utm_source": missing, "utm_medium": missing, "utm_campaign": missing,
        "landing_page": pa.array(landing.tolist(), pa.string()),
        "device": pa.array(["desktop"] * len(who), pa.string()),
        "country_code": pa.array(country.tolist(), pa.string()),
    })


def validate(tables: dict, truth: dict) -> dict:
    """GEN-06 for the quirks: each exists in raw, with the count the truth records, and not in clean, measured in SQL. Returns
    the measures (truth findings.raw). Raises ValueError naming the quirk on the first failure."""
    clean, raw = tables["clean"], tables["raw"]
    planted = truth["planted"]["raw"]
    con = duckdb.connect(config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    try:
        for prefix, source in (("c", clean), ("r", raw)):
            for name, table in source.items():
                con.register(f"{prefix}_{name}", table)

        def one(sql):
            return con.execute(sql).fetchone()

        meta_sql = """FROM {p}_sessions s JOIN {p}_campaigns c USING (utm_campaign) JOIN {p}_channels ch USING (channel_id)
                      WHERE ch.channel_name = 'meta'"""
        clean_spellings = one(f"SELECT count(DISTINCT utm_source), count(DISTINCT utm_medium) {meta_sql.format(p='c')}")
        raw_spellings = one(f"SELECT count(DISTINCT utm_source), count(DISTINCT utm_medium) {meta_sql.format(p='r')}")
        respelled = one("""SELECT count(*) FROM r_sessions r JOIN c_sessions c USING (session_id)
                           WHERE r.utm_campaign = c.utm_campaign
                             AND (r.utm_source IS DISTINCT FROM c.utm_source OR r.utm_medium IS DISTINCT FROM c.utm_medium)""")[0]
        li_sql = """FROM {p}_ad_spend_daily a JOIN {p}_campaigns c USING (campaign_id) JOIN {p}_channels ch USING (channel_id)
                    WHERE ch.channel_name = 'linkedin'"""
        li_rows, li_la, li_usd = one(f"""SELECT count(*), count(*) FILTER (WHERE export_timezone = '{LA}'),
                                          count(*) FILTER (WHERE currency = 'USD') {li_sql.format(p='r')}""")
        shifted, cents_off = one(f"""SELECT count(*), count(*) FILTER (WHERE abs(a.spend * fx.eur_per_unit - k.spend) > 0.005)
            FROM r_ad_spend_daily a JOIN r_campaigns c USING (campaign_id) JOIN r_channels ch USING (channel_id)
            JOIN c_ad_spend_daily k ON k.campaign_id = a.campaign_id AND k.spend_date = a.spend_date + 1
                                    AND k.clicks = a.clicks AND k.impressions = a.impressions
            JOIN r_fx_rates_monthly fx ON fx.month = date_trunc('month', k.spend_date) AND fx.currency = a.currency
            WHERE ch.channel_name = 'linkedin'""")
        clean_zones = one("SELECT count(*) FILTER (WHERE export_timezone <> 'UTC' OR currency <> 'EUR') FROM c_ad_spend_daily")[0]
        dupes, dupe_dates, dupe_channels = one("""SELECT coalesce(sum(n - 1), 0), list(DISTINCT spend_date ORDER BY spend_date),
                list(DISTINCT ch.channel_name) FROM (SELECT spend_date, campaign_id, count(*) AS n FROM r_ad_spend_daily
                GROUP BY ALL HAVING count(*) > 1) d JOIN r_campaigns c USING (campaign_id) JOIN r_channels ch USING (channel_id)""")
        clean_dupes = one("SELECT count(*) - count(DISTINCT (spend_date, campaign_id)) FROM c_ad_spend_daily")[0]
        bots, raw_total, clean_max = one("""WITH d AS (SELECT visitor_id, CAST(session_start AS DATE) AS day, count(*) AS n
                                                       FROM r_sessions GROUP BY ALL HAVING count(*) >= 200)
            SELECT (SELECT coalesce(sum(n), 0) FROM d), (SELECT count(*) FROM r_sessions),
                   (SELECT max(n) FROM (SELECT count(*) AS n FROM c_sessions GROUP BY visitor_id, CAST(session_start AS DATE)))""")
        empty, empty_clean = one("""SELECT (SELECT count(*) FROM r_sessions WHERE utm_source = '' AND utm_medium = '' AND utm_campaign = ''),
                                           (SELECT count(*) FROM c_sessions WHERE utm_source = '' OR utm_medium = '' OR utm_campaign = '')""")
        refunds = one("SELECT avg(CASE WHEN refunded THEN 1 ELSE 0 END), count(*) FILTER (WHERE refunded) FROM c_payments")
    finally:
        con.close()
    clean_n = clean["sessions"].num_rows
    mv._check(clean_spellings == (1, 1) and raw_spellings == (5, 3) and respelled == planted["Q-03-01"]["count"] > 0,
              f"Q-03-01: Meta spellings clean {clean_spellings}, raw {raw_spellings}, {respelled} respelled")
    mv._check(li_rows > 0 and li_la == li_rows == planted["Q-03-02"]["count"] and shifted == li_rows,
              f"Q-03-02: {li_la} of {li_rows} LinkedIn rows on the Los Angeles day, {shifted} one day before their clean row")
    mv._check(li_usd == li_rows == planted["Q-03-03"]["count"] and cents_off == 0 and clean_zones == 0,
              f"Q-03-03: {li_usd} of {li_rows} LinkedIn rows in USD, {cents_off} off the clean euros")
    mv._check(dupes == planted["Q-03-04"]["count"] > 0 and dupe_channels == ["meta"] and clean_dupes == 0
              and [d.isoformat() for d in dupe_dates] == planted["Q-03-04"]["dates"], f"Q-03-04: {dupes} re-imported rows")
    share = bots / raw_total
    mv._check(0.025 <= share <= 0.035 and raw_total - clean_n == planted["Q-03-05"]["count"] and clean_max < 50,
              f"Q-03-05: bot share {share:.4f}, busiest clean visitor-day {clean_max}")
    mv._check(0.008 <= empty / clean_n <= 0.012 and empty == planted["Q-03-06"]["count"] and empty_clean == 0,
              f"Q-03-06: {empty} sessions with empty strings, {empty_clean} in clean")
    mv._check(0.035 <= float(refunds[0]) <= 0.045 and refunds[1] == planted["Q-03-07"]["count"]
              and raw["payments"].equals(clean["payments"]), f"Q-03-07: refunded share {float(refunds[0]):.4f}")
    mv._check(all(raw[name].equals(clean[name]) for name in UNCHANGED), "raw's unchanged copies differ from clean")
    return {
        "Q-03-01": {"raw_spellings": raw_spellings[0], "raw_mediums": raw_spellings[1], "respelled_sessions": respelled},
        "Q-03-02": {"linkedin_rows_on_the_los_angeles_day": li_la},
        "Q-03-03": {"linkedin_rows_in_usd": li_usd},
        "Q-03-04": {"reimported_rows": int(dupes)},
        "Q-03-05": {"bot_sessions": int(bots), "bot_share": round(share, 4)},
        "Q-03-06": {"empty_string_sessions": empty, "share": round(empty / clean_n, 4)},
        "Q-03-07": {"refunded_share": round(float(refunds[0]), 4)},
    }

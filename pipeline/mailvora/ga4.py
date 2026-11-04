"""Mailvora's GA4 export sample: sprint 9, Task L1 (S9-02; ERRATA E-218, which decides E-131; rulings S9-C11, S9-C16 to S9-C18).

GA4's BigQuery export of Mailvora's website (knowledge/07 §5.2), cut to what SQL level 7 uses: one table, events, derived from
mailvora's own clean rows on the property's days, 1 October to 31 December 2025 in Europe/Dublin (S9-C11). generate() returns it as a
pyarrow Table; validate() measures S9-02's rules in SQL and raises ValueError, naming the rule, on the first one that fails (as
GEN-01 does for Mailvora). Its own draws come from SEED's streams, spawned in STREAMS order (GEN-02): no Mailvora seed, stream or
table changes, and Mailvora's tables are only read. The schema also holds views onto mailvora's sessions, signups, subscriptions and
payments (S9-C18, ga4_ddl.sql), so a graded query, which names no schema, can join them to events.

The events, in mailvora's terms:
- each session whose session_start falls on those days gives a session_start and one or more page_view, all carrying the session's
  ga_session_id (its start in seconds since 1970) and ga_session_number (its place among all of the visitor's sessions, from 2024 on);
  and first_visit too when it is the visitor's first session ever. first_visit, session_start and the first page_view (the landing
  page) share the session's first microsecond; each later page_view follows the one before by that page's engagement time, which is
  under 30 minutes, so every event of a session is within 30 minutes of the one before (S9-C17: GA4 ends a session after 30 minutes
  without activity);
- sign_up at each signup on those days (by signup_ts), in the visitor's latest session started at or before it when it is within 30
  minutes of that session's event before it; otherwise the sign_up is sent from Mailvora's server, as every purchase is;
- purchase at each subscription's first payment on those days (by paid_at), sent by Mailvora's billing server through the GA4
  Measurement Protocol (S9-C17): it carries user_pseudo_id, user_id, value and ecommerce, belongs to no session (no ga_session_id,
  ga_session_number or page_location), has no device, and its geo is the account's country (signups.country_code);
- user_pseudo_id is visitor_id; user_id is signups.user_id as text, from the sign_up event on; traffic_source is the visitor's first
  session ever (GA4's first-touch fields); device and geo are the session's, geo as the country's English name.
Planted as real tags do (S9-02): value in double_value for most purchases and in int_value for INT_VALUE_SHARE of them; consent
denied for CONSENT_DENIED_SHARE of the visitors, whose website events have no user_pseudo_id, user_id, ga_session_id or
ga_session_number (consent is the website tag's: the server's events keep user_pseudo_id and user_id); two visitors' sessions that
start in the same second share a ga_session_id (mailvora's own rows hold thousands, so none is added); event_date is the Dublin day,
so an event after 23:00 UTC before 26 October 2025 (Irish summer time) is dated the next day.

Every rate below is a calibration estimate for a plausible small business website, not a figure from the research files.
"""
from __future__ import annotations

import duckdb
import numpy as np
import pyarrow as pa

SCHEMA = "mailvora_ga4"
TABLES = ("events",)
VIEWS = ("sessions", "signups", "subscriptions", "payments")   # S9-C18: mailvora's tables a level 7 item joins, as views
SEED = 330307                                            # Mailvora's 3303 with the level, 07: its own seed, not a Mailvora stream
STREAMS = ("consent", "page_views", "timing", "pages", "value_slot")   # one child each, in this order (append only)
NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17
TIMEZONE = "Europe/Dublin"                               # the property's time zone (S9-02)
WINDOW = ("2025-10-01", "2025-12-31")                    # S9-C11: the property's days, first and last
HOST = "https://www.mailvora.example"                    # a fictional address (.example is reserved)
SIGN_UP_PAGE = "/signup"
SESSION_TIMEOUT_US = 30 * 60 * 1_000_000                 # S9-C17: GA4 ends a session after 30 minutes without activity
INT_VALUE_SHARE = 0.15                                   # purchases whose value arrives in int_value (an older tag's whole number)
CONSENT_DENIED_SHARE = 0.02                              # visitors who deny analytics consent (S9-02: about 2% of events)
PAGE_VIEW_P = 0.75                                       # page views a session: 1 + geometric, 4 in 3 on average
# A page's engagement time, lognormal, in milliseconds. Its cap, with the under 1 ms jitter, keeps the next page_view within 30 minutes.
DWELL_MS = {"median": 8000.0, "sigma": 1.0, "min": 1000, "max": 1_790_000}
ENGAGED_MS = 10_000                                      # GA4: an engaged session lasts 10 seconds, or has 2 page views or a key event
# Pages a visitor moves on to after the landing page, with weights.
SITE_PAGES = (("/", 0.12), ("/pricing", 0.24), ("/features", 0.14), ("/features/automation", 0.06), ("/templates", 0.10),
              ("/tutorials", 0.04), ("/blog/newsletter-ideas", 0.05), ("/blog/email-subject-lines", 0.04),
              ("/blog/gdpr-email-consent", 0.03), ("/compare/mailchimp-alternative", 0.04), ("/signup", 0.10), ("/login", 0.04))
# geo.country: GA4 writes the country's English name (mailvora.countries' codes).
COUNTRY_NAMES = {"AT": "Austria", "BE": "Belgium", "CZ": "Czechia", "DE": "Germany", "DK": "Denmark", "ES": "Spain", "FI": "Finland",
                 "FR": "France", "GR": "Greece", "IE": "Ireland", "IT": "Italy", "NL": "Netherlands", "PL": "Poland", "PT": "Portugal",
                 "RO": "Romania", "SE": "Sweden"}
# S9-02 asked for under 500,000 rows, but S9-C11's window holds 273,012 mailvora sessions, whose session_start and first page_view
# alone make 546,024 rows, and S9-02's reconciliation keeps every one. Ruling S9-C16 accepts this cap instead (the controller amends
# E-218).
ROW_CAP = 1_000_000
# event_params' type, as pipeline/mailvora/ga4_ddl.sql creates it (S9-02).
PARAMS_TYPE = "STRUCT(key VARCHAR, value STRUCT(string_value VARCHAR, int_value BIGINT, float_value DOUBLE, double_value DOUBLE))[]"


def rngs(seed: int = SEED) -> dict[str, np.random.Generator]:
    children = np.random.SeedSequence(seed).spawn(len(STREAMS))
    return {name: np.random.default_rng(child) for name, child in zip(STREAMS, children)}


# The window, mailvora's sessions numbered per visitor with each visitor's first touch, and the window's sessions, signups and first
# payments, each in a fixed order (its draws follow that order). Times are microseconds since 1970, UTC.
SOURCES_SQL = """
CREATE TEMP TABLE bounds AS
SELECT epoch_us(timezone('{tz}', TIMESTAMP '{first} 00:00:00')) AS lo,
       epoch_us(timezone('{tz}', TIMESTAMP '{last} 00:00:00' + INTERVAL 1 DAY)) AS hi;
CREATE TEMP TABLE numbered AS
SELECT visitor_id, session_id, epoch_us(session_start) AS start_us,
       row_number() OVER (PARTITION BY visitor_id ORDER BY session_start, session_id) AS session_number,
       landing_page, device, country_code, utm_source, utm_medium, utm_campaign
FROM c_sessions;
CREATE TEMP TABLE first_touch AS
SELECT visitor_id,
       CASE WHEN utm_campaign IS NOT NULL THEN utm_campaign WHEN utm_medium IN ('organic', 'referral') THEN '(' || utm_medium || ')'
            ELSE '(direct)' END AS ts_name,
       CASE WHEN utm_campaign IS NOT NULL OR utm_medium IN ('organic', 'referral') THEN utm_medium ELSE '(none)' END AS ts_medium,
       coalesce(utm_source, '(direct)') AS ts_source
FROM numbered WHERE session_number = 1;
CREATE TEMP TABLE ws AS
SELECT row_number() OVER (ORDER BY n.start_us, n.session_id) - 1 AS w, n.*
FROM numbered n, bounds b WHERE n.start_us >= b.lo AND n.start_us < b.hi;
CREATE TEMP TABLE su AS
SELECT row_number() OVER (ORDER BY u.signup_us, u.user_id) - 1 AS i, u.*
FROM (SELECT user_id, visitor_id, epoch_us(signup_ts) AS signup_us, country_code FROM c_signups) u, bounds b
WHERE u.signup_us >= b.lo AND u.signup_us < b.hi;
CREATE TEMP TABLE fp AS
SELECT row_number() OVER (ORDER BY f.paid_us, f.payment_id) - 1 AS i, f.payment_id, f.paid_us, f.amount, u.user_id, u.visitor_id,
       u.country_code
FROM (SELECT subscription_id, min(epoch_us(paid_at)) AS paid_us, arg_min(payment_id, paid_at) AS payment_id,
             CAST(arg_min(amount_eur, paid_at) AS DOUBLE) AS amount
      FROM c_payments GROUP BY 1) f
JOIN c_subscriptions s ON s.subscription_id = f.subscription_id JOIN c_signups u ON u.user_id = s.user_id, bounds b
WHERE f.paid_us >= b.lo AND f.paid_us < b.hi;
"""

# A sign_up's candidate session: the visitor's latest session started at or before it; w is that session's place in the window
# (missing when it started before the window).
SIGN_UP_SESSION_SQL = """
SELECT su.i, su.signup_us, n.start_us AS s_start, n.session_number, n.device, n.country_code, ws.w
FROM su ASOF LEFT JOIN numbered n ON su.visitor_id = n.visitor_id AND su.signup_us >= n.start_us
LEFT JOIN ws ON ws.visitor_id = n.visitor_id AND ws.start_us = n.start_us
ORDER BY su.i
"""

# One flat row per event, then the export's shape. rank orders the events that share a microsecond; ord is the row's place in its
# own source; server marks an event Mailvora's server sends (S9-C17), which belongs to no session. A consent-denied visitor's website
# events lose ga_session_id, ga_session_number, user_pseudo_id and user_id. user_id is set from the sign_up on: the sign_up event's
# own microsecond for a signup in the window, else signup_ts.
EVENTS_SQL = """
CREATE TEMP TABLE flat AS
SELECT 0 AS rank, ws.w AS ord, sd.t0 AS at_us, 'first_visit' AS event_name, ws.visitor_id, false AS server, ws.start_us AS s_start,
       ws.session_number, ws.landing_page AS path, sd.engaged, NULL::BIGINT AS msec, NULL::DOUBLE AS amount, NULL::BOOLEAN AS int_slot,
       NULL::BIGINT AS payment_id, ws.device, ws.country_code
FROM ws JOIN sd USING (w) WHERE ws.session_number = 1
UNION ALL
SELECT 1, ws.w, sd.t0, 'session_start', ws.visitor_id, false, ws.start_us, ws.session_number, ws.landing_page, sd.engaged, NULL, NULL,
       NULL, NULL, ws.device, ws.country_code
FROM ws JOIN sd USING (w)
UNION ALL
SELECT 2, pg.ord, pg.at_us, 'page_view', ws.visitor_id, false, ws.start_us, ws.session_number, pg.path, sd.engaged, pg.msec, NULL,
       NULL, NULL, ws.device, ws.country_code
FROM pg JOIN ws USING (w) JOIN sd USING (w)
UNION ALL
SELECT 3, su.i, kd.at_us, 'sign_up', su.visitor_id, kd.server, CASE WHEN NOT kd.server THEN kd.s_start END,
       CASE WHEN NOT kd.server THEN kd.session_number END, CASE WHEN NOT kd.server THEN '{sign_up_page}' END,
       CASE WHEN NOT kd.server THEN '1' END, NULL, NULL, NULL, NULL, CASE WHEN NOT kd.server THEN kd.device END,
       CASE WHEN kd.server THEN su.country_code ELSE kd.country_code END
FROM su JOIN su_keyed kd USING (i)
UNION ALL
SELECT 4, fp.i, fp.paid_us + fd.offset_us, 'purchase', fp.visitor_id, true, NULL, NULL, NULL, NULL, NULL, fp.amount, fd.int_slot,
       fp.payment_id, NULL, fp.country_code
FROM fp JOIN fp_draws fd USING (i);
CREATE TEMP TABLE user_from AS
SELECT u.visitor_id, CAST(u.user_id AS VARCHAR) AS user_id,
       coalesce((SELECT f.at_us FROM flat f WHERE f.event_name = 'sign_up' AND f.visitor_id = u.visitor_id), epoch_us(u.signup_ts)) AS at_us
FROM c_signups u;
SELECT
    CAST(strftime(timezone('{tz}', CAST(make_timestamp(f.at_us) AS TIMESTAMPTZ)), '%Y%m%d') AS VARCHAR) AS event_date,
    CAST(f.at_us AS BIGINT) AS event_timestamp,
    CAST(f.event_name AS VARCHAR) AS event_name,
    CAST(list_filter([
        {{'key': 'ga_session_id', 'value': {{'string_value': NULL::VARCHAR, 'int_value': CASE WHEN NOT c.denied THEN f.s_start // 1000000 END,
                                            'float_value': NULL::DOUBLE, 'double_value': NULL::DOUBLE}}}},
        {{'key': 'ga_session_number', 'value': {{'string_value': NULL::VARCHAR, 'int_value': CASE WHEN NOT c.denied THEN f.session_number END,
                                                'float_value': NULL::DOUBLE, 'double_value': NULL::DOUBLE}}}},
        {{'key': 'page_location', 'value': {{'string_value': '{host}' || f.path, 'int_value': NULL::BIGINT, 'float_value': NULL::DOUBLE,
                                            'double_value': NULL::DOUBLE}}}},
        {{'key': 'session_engaged', 'value': {{'string_value': f.engaged, 'int_value': NULL::BIGINT, 'float_value': NULL::DOUBLE,
                                              'double_value': NULL::DOUBLE}}}},
        {{'key': 'engagement_time_msec', 'value': {{'string_value': NULL::VARCHAR, 'int_value': f.msec, 'float_value': NULL::DOUBLE,
                                                   'double_value': NULL::DOUBLE}}}},
        {{'key': 'value', 'value': {{'string_value': NULL::VARCHAR, 'int_value': NULL::BIGINT, 'float_value': NULL::DOUBLE,
                                    'double_value': CASE WHEN NOT f.int_slot THEN f.amount END}}}},
        {{'key': 'value', 'value': {{'string_value': NULL::VARCHAR, 'int_value': CASE WHEN f.int_slot THEN CAST(f.amount AS BIGINT) END,
                                    'float_value': NULL::DOUBLE, 'double_value': NULL::DOUBLE}}}}
    ], lambda p: p.value.string_value IS NOT NULL OR p.value.int_value IS NOT NULL OR p.value.double_value IS NOT NULL) AS {params_type})
        AS event_params,
    CAST(CASE WHEN (f.server OR NOT c.denied) AND f.at_us >= uf.at_us THEN uf.user_id END AS VARCHAR) AS user_id,
    CAST(CASE WHEN f.server OR NOT c.denied THEN f.visitor_id END AS VARCHAR) AS user_pseudo_id,
    CAST({{'name': ft.ts_name, 'medium': ft.ts_medium, 'source': ft.ts_source}} AS STRUCT(name VARCHAR, medium VARCHAR, source VARCHAR))
        AS traffic_source,
    CAST(CASE WHEN f.device IS NOT NULL THEN {{'category': f.device}} END AS STRUCT(category VARCHAR)) AS device,
    CAST({{'country': cn.country}} AS STRUCT(country VARCHAR)) AS geo,
    CAST(CASE WHEN f.payment_id IS NOT NULL THEN {{'transaction_id': CAST(f.payment_id AS VARCHAR), 'purchase_revenue': f.amount}} END
         AS STRUCT(transaction_id VARCHAR, purchase_revenue DOUBLE)) AS ecommerce
FROM flat f
JOIN consent c ON c.visitor_id = f.visitor_id
JOIN first_touch ft ON ft.visitor_id = f.visitor_id
JOIN country_names cn ON cn.country_code = f.country_code
LEFT JOIN user_from uf ON uf.visitor_id = f.visitor_id
WHERE f.at_us < (SELECT hi FROM bounds)
ORDER BY f.at_us, f.rank, f.ord
"""


def _fetch(con, sql: str) -> dict:
    """A query's columns as numpy arrays (masked where a value is missing)."""
    return con.execute(sql).fetchnumpy()


def _present(values) -> np.ndarray:
    """True where a fetched value is there."""
    return ~np.ma.getmaskarray(values) if np.ma.isMaskedArray(values) else ~np.isnan(np.asarray(values, dtype=float))


def _pick(rng: np.random.Generator, options, size: int) -> np.ndarray:
    p = np.array([w for _, w in options], dtype=float)
    return rng.choice(len(options), size=size, p=p / p.sum())


def generate(clean: dict, seed: int = SEED) -> dict[str, pa.Table]:
    """The events table from mailvora's clean tables (sessions, signups, subscriptions, payments), which it only reads."""
    r = rngs(seed)
    con = duckdb.connect(config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    try:
        for name in ("sessions", "signups", "subscriptions", "payments"):
            con.register(f"c_{name}", clean[name])
        con.execute(SOURCES_SQL.format(tz=TIMEZONE, first=WINDOW[0], last=WINDOW[1]))
        ws = _fetch(con, "SELECT w, start_us, landing_page FROM ws ORDER BY w")
        sign_ups = _fetch(con, SIGN_UP_SESSION_SQL)
        if not _present(sign_ups["s_start"]).all():
            raise ValueError("S9-02: a sign_up has no session of its visitor started at or before it")
        n_firsts = con.execute("SELECT count(*) FROM fp").fetchone()[0]
        visitors = _fetch(con, "SELECT DISTINCT visitor_id FROM (SELECT visitor_id FROM ws UNION ALL SELECT visitor_id FROM su "
                                "UNION ALL SELECT visitor_id FROM fp) ORDER BY 1")["visitor_id"]
        n_sessions, n_signups = len(ws["w"]), len(sign_ups["i"])

        # Draws, each stream in a fixed order. Consent is the visitor's (a browser keeps its choice).
        denied = r["consent"].random(len(visitors)) < CONSENT_DENIED_SHARE
        views = r["page_views"].geometric(PAGE_VIEW_P, n_sessions)
        n_views = int(views.sum())
        dwell = np.exp(np.log(DWELL_MS["median"]) + DWELL_MS["sigma"] * r["page_views"].standard_normal(n_views))
        dwell = np.clip(np.round(dwell), DWELL_MS["min"], DWELL_MS["max"]).astype(np.int64)
        first_us = r["timing"].integers(0, 1_000_000, n_sessions)
        jitter = r["timing"].integers(0, 1_000, n_views)
        sign_up_us = r["timing"].integers(0, 1_000_000, n_signups)
        purchase_us = r["timing"].integers(0, 1_000_000, n_firsts)
        later_page = _pick(r["pages"], SITE_PAGES, n_views)
        int_slot = np.zeros(n_firsts, dtype=bool)
        int_slot[r["value_slot"].choice(n_firsts, size=round(n_firsts * INT_VALUE_SHARE), replace=False)] = True

        # Page views: the first at the session's first microsecond, on the landing page; each later one after the page before.
        owner = np.repeat(np.arange(n_sessions), views)
        starts = np.cumsum(views) - views
        position = np.arange(n_views) - starts[owner]
        t0 = ws["start_us"].astype(np.int64) + first_us
        step = dwell * 1000 + jitter
        before = np.cumsum(step) - step
        at_us = t0[owner] + before - before[starts][owner]
        paths = np.array([p for p, _ in SITE_PAGES], dtype=object)[later_page]
        paths = np.where(position == 0, ws["landing_page"][owner], paths)

        # S9-C17: a sign_up is in its session when that session is in the window and the sign_up is within 30 minutes of the session's
        # event before it (the latest page_view at or before it; the first is at the session's start). Otherwise the server sends it.
        sign_up_at = np.asarray(sign_ups["signup_us"], dtype=np.int64) + sign_up_us
        in_window = _present(sign_ups["w"])
        w = np.where(in_window, np.asarray(np.ma.filled(sign_ups["w"], 0), dtype=np.int64), 0)
        key = owner * 10**11 + (at_us - t0[owner])           # page views in session order, then time (a session is under a day)
        last = np.searchsorted(key, w * 10**11 + (sign_up_at - t0[w]), side="right") - 1
        previous = np.where(owner[last] == w, at_us[last], t0[w])
        server = ~in_window | (sign_up_at - previous > SESSION_TIMEOUT_US)

        engaged = (views >= 2) | (np.bincount(owner, weights=dwell, minlength=n_sessions) >= ENGAGED_MS)
        engaged[w[~server]] = True                            # a sign_up is a key event: its session is engaged

        con.register("consent", pa.table({"visitor_id": pa.array(visitors.tolist(), pa.string()), "denied": pa.array(denied)}))
        con.register("sd", pa.table({"w": pa.array(np.arange(n_sessions), pa.int64()), "t0": pa.array(t0, pa.int64()),
                                     "engaged": pa.array(np.where(engaged, "1", "0").tolist(), pa.string())}))
        con.register("pg", pa.table({"ord": pa.array(np.arange(n_views), pa.int64()), "w": pa.array(owner, pa.int64()),
                                     "at_us": pa.array(at_us, pa.int64()), "path": pa.array(paths.tolist(), pa.string()),
                                     "msec": pa.array(dwell, pa.int64())}))
        con.register("su_keyed", pa.table({
            "i": pa.array(np.asarray(sign_ups["i"], dtype=np.int64)), "at_us": pa.array(sign_up_at, pa.int64()),
            "server": pa.array(server), "s_start": pa.array(np.asarray(sign_ups["s_start"], dtype=np.int64)),
            "session_number": pa.array(np.asarray(sign_ups["session_number"], dtype=np.int64)),
            "device": pa.array(sign_ups["device"].tolist(), pa.string()), "country_code": pa.array(sign_ups["country_code"].tolist(), pa.string())}))
        con.register("fp_draws", pa.table({"i": pa.array(np.arange(n_firsts), pa.int64()), "offset_us": pa.array(purchase_us, pa.int64()),
                                           "int_slot": pa.array(int_slot)}))
        con.register("country_names", pa.table({"country_code": list(COUNTRY_NAMES), "country": list(COUNTRY_NAMES.values())}))
        sql = EVENTS_SQL.format(tz=TIMEZONE, host=HOST, sign_up_page=SIGN_UP_PAGE, params_type=PARAMS_TYPE)
        *setup, final = [s for s in sql.split(";") if s.strip()]
        for statement in setup:
            con.execute(statement)
        events = con.execute(final).to_arrow_table()
    finally:
        con.close()
    return {"events": events}


# ---- validation (as GEN-01) ---------------------------------------------------------------------------------------------------

def _check(ok: bool, message: str) -> None:
    if not ok:
        raise ValueError(message)


def measure(tables: dict, clean: dict) -> dict:
    """S9-02's and S9-C17's rules measured in SQL on the events and mailvora's clean tables: counts and shares only."""
    con = duckdb.connect(config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    try:
        con.register("events", tables["events"])
        for name in ("sessions", "signups", "payments"):
            con.register(f"c_{name}", clean[name])
        day = "CAST(timezone('{tz}', {{c}}) AS DATE) BETWEEN DATE '{first}' AND DATE '{last}'".format(tz=TIMEZONE, first=WINDOW[0], last=WINDOW[1])
        param = "list_filter(event_params, lambda p: p.key = '{k}')[1].value"
        sid = param.format(k="ga_session_id") + ".int_value"
        counts = dict(con.execute("SELECT event_name, count(*) FROM events GROUP BY 1").fetchall())
        sessions, signups, firsts = con.execute(f"""SELECT
            (SELECT count(*) FROM c_sessions WHERE {day.format(c='session_start')}),
            (SELECT count(*) FROM c_signups WHERE {day.format(c='signup_ts')}),
            (SELECT count(*) FROM (SELECT min(paid_at) AS paid_at FROM c_payments GROUP BY subscription_id) WHERE {day.format(c='paid_at')})""").fetchone()
        rows, denied, first_day, last_day = con.execute("""SELECT count(*), count(*) FILTER (WHERE user_pseudo_id IS NULL),
                                                           min(event_date), max(event_date) FROM events""").fetchone()
        in_int = con.execute(f"""SELECT count(*) FROM events WHERE event_name = 'purchase'
                                 AND {param.format(k='value')}.int_value IS NOT NULL""").fetchone()[0]
        shared = con.execute(f"""SELECT count(*) FROM (SELECT {sid} FROM events WHERE event_name = 'session_start' AND user_pseudo_id IS NOT NULL
                                 GROUP BY 1 HAVING count(DISTINCT user_pseudo_id) > 1)""").fetchone()[0]
        pairs, starts, sessionless_purchases, server_sign_ups = con.execute(f"""SELECT
            (SELECT count(*) FROM (SELECT DISTINCT user_pseudo_id, {sid} FROM events WHERE user_pseudo_id IS NOT NULL AND {sid} IS NOT NULL)),
            (SELECT count(*) FROM events WHERE event_name = 'session_start' AND user_pseudo_id IS NOT NULL AND {sid} IS NOT NULL),
            (SELECT count(*) FROM events WHERE event_name = 'purchase' AND {sid} IS NULL AND {param.format(k='page_location')}.string_value IS NULL),
            (SELECT count(*) FROM events WHERE event_name = 'sign_up' AND {param.format(k='page_location')}.string_value IS NULL)""").fetchone()
        late = con.execute(f"""SELECT count(*) FROM (SELECT event_timestamp - lag(event_timestamp) OVER (PARTITION BY user_pseudo_id, s
                                                                                                    ORDER BY event_timestamp) AS gap
                                                    FROM (SELECT user_pseudo_id, {sid} AS s, event_timestamp FROM events WHERE {sid} IS NOT NULL))
                               WHERE gap > {SESSION_TIMEOUT_US}""").fetchone()[0]
        return {"rows": rows, "events": dict(sorted(counts.items())), "mailvora": {"sessions": sessions, "signups": signups, "first_payments": firsts},
                "consent_denied_share": round(denied / rows, 4) if rows else 0.0, "int_value_purchases": in_int,
                "shared_ga_session_ids": shared, "event_dates": [first_day, last_day], "session_pairs": pairs,
                "session_starts_with_ids": starts, "sessionless_purchases": sessionless_purchases, "server_sign_ups": server_sign_ups,
                "events_over_30_minutes_after_the_one_before": late}
    finally:
        con.close()


def validate(tables: dict, clean: dict) -> dict:
    """Raises ValueError naming the first S9-02 or S9-C17 rule the sample breaks; returns the measures."""
    m = measure(tables, clean)
    e, mv = m["events"], m["mailvora"]
    _check((e.get("session_start"), e.get("sign_up"), e.get("purchase")) == (mv["sessions"], mv["signups"], mv["first_payments"]),
           f"S9-02 reconciliation: events {e}, mailvora {mv}")
    _check(m["rows"] < ROW_CAP, f"S9-C16 size: {m['rows']} rows")
    _check(m["event_dates"] == [WINDOW[0].replace("-", ""), WINDOW[1].replace("-", "")], f"S9-C11 window: {m['event_dates']}")
    _check(0.015 <= m["consent_denied_share"] <= 0.025, f"S9-02 consent denied: {m['consent_denied_share']}")
    _check(m["int_value_purchases"] == round(e.get("purchase", 0) * INT_VALUE_SHARE), f"S9-02 value in int_value: {m['int_value_purchases']}")
    _check(m["shared_ga_session_ids"] > 0, "S9-02 shared ga_session_id: none")
    _check(m["sessionless_purchases"] == e.get("purchase", 0), f"S9-C17 purchases with a session: {e.get('purchase', 0) - m['sessionless_purchases']}")
    _check(m["events_over_30_minutes_after_the_one_before"] == 0, f"S9-C17 30 minutes: {m['events_over_30_minutes_after_the_one_before']}")
    _check(m["session_pairs"] == m["session_starts_with_ids"], f"S9-C17 sessions: {m['session_pairs']} pairs, {m['session_starts_with_ids']} starts")
    return m

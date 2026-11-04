"""Schema-panel notes for mailvora_ga4 (sprint 9, Task L1; S9-02, S9-C17, S9-C18, S9-C28): Mailvora's note shape
(pipeline/mailvora/notes.py: grain, keys, links, a 5-row sample, allowed values), from level 7. The sample's list of key and value
structs is JSON as DuckDB returns it (lists and objects of text, numbers and missing values). The events note states each choice
S9-02 left open: the window (S9-C11), the server-side purchases and sign-ups (S9-C17), how ga_session_number counts, what
engagement_time_msec and session_engaged mean, the address, geo's country names, the share of purchases whose value is in int_value,
and the purchases of refunded first payments. The four views onto Mailvora's tables (S9-C18) keep Mailvora's grain, each with a
sentence saying what it is and how far it reaches, and only the links between tables of this schema.

L1-R1, L1-R2 (S9-C28): every note names only tables of this schema (events and the four views): a graded query names no schema, so
a pointer to mailvora.<table>, countries or campaigns would send a learner to a table the query cannot read.
"""
from __future__ import annotations

import datetime as dt

from mailvora import ga4
from mailvora import notes as mailvora_notes

FROM_LEVEL = 7
GRAIN = ("one row per event: a session_start and one or more page_view per session, first_visit on a visitor's first session, "
         "sign_up at each signup and purchase at each subscription's first payment")
WINDOW_DAYS = "the Dublin days 1 October to 31 December 2025"
# A time column of a view: a UTC instant; the question says which day it counts it on (L1-R1).
INSTANT = ("A UTC instant with its time zone (TIMESTAMPTZ). A question says which day it counts it on, for example the property's "
           f"day in {ga4.TIMEZONE}, as event_date does.")
# The views' column notes, true in this schema: Mailvora's own, without the pointers to countries and campaigns (L1-R1).
VIEW_COLUMN_NOTES = {
    "sessions": {
        "session_start": INSTANT,
        "visitor_id": f"{mailvora_notes.VISITORS} events.user_pseudo_id holds it.",
        "utm_campaign": ("The campaign's utm_campaign; missing on a session no campaign sent, which is organic when utm_medium is "
                         "'organic', referral when it is 'referral', and direct when utm_source, utm_medium and utm_campaign are all "
                         "missing."),
    },
    "signups": {"signup_ts": INSTANT, "country_code": "The user's country, as a two-letter code (IE for Ireland)."},
    "subscriptions": dict(mailvora_notes.COLUMN_NOTES["subscriptions"]),
    "payments": {
        "paid_at": INSTANT,
        "refunded": ("True when the payment was refunded: leave it out of revenue. events keeps the purchase of a first payment that "
                     "was later refunded."),
    },
}
# The column each view's span is measured on.
SPAN_COLUMNS = {"sessions": "session_start", "signups": "signup_ts", "subscriptions": "start_date", "payments": "paid_at"}


def _day(text: str) -> str:
    d = dt.date.fromisoformat(text)
    return f"{d.day} {d.strftime('%B')} {d.year}"


def events_column_notes(con, schema: str) -> dict[str, str]:
    """events' column notes; the count of purchases whose first payment was later refunded comes from the data (L1-R3)."""
    purchases, refunded = con.execute(f"""SELECT count(*), count(*) FILTER (WHERE p.refunded)
        FROM {schema}.events e JOIN {schema}.payments p ON CAST(p.payment_id AS VARCHAR) = e.ecommerce.transaction_id
        WHERE e.event_name = 'purchase'""").fetchone()
    return {
        "event_date": (f"The event's day in {ga4.TIMEZONE}, the property's time zone, as text YYYYMMDD, from "
                       f"{ga4.WINDOW[0].replace('-', '')} to {ga4.WINDOW[1].replace('-', '')}. BigQuery stores one table per day, "
                       "events_YYYYMMDD; here the days are stacked in one table."),
        "event_timestamp": "When the event happened, in microseconds since 1970-01-01 UTC.",
        "event_name": (f"The sample holds {WINDOW_DAYS}: its session_start events are the rows of sessions whose session_start falls "
                       "on those days, its sign_up events the rows of signups by signup_ts, and its purchase events each "
                       "subscription's first payment by paid_at. Each event of a session comes within 30 minutes of the one before, as "
                       "GA4 ends a session after 30 minutes without activity. Every purchase is sent by Mailvora's billing server "
                       "through the GA4 Measurement Protocol, as is common in real exports: it belongs to no session, so it has no "
                       "ga_session_id, ga_session_number or page_location. A sign_up belongs to the visitor's latest session when it "
                       "comes within 30 minutes of that session's event before it; otherwise it is sent from the server the same way."),
        "event_params": ("One key and value pair per parameter, the value in one of string_value, int_value, float_value or "
                         "double_value. ga_session_id is the session's start in seconds since 1970, and a session is user_pseudo_id "
                         "with ga_session_id: two visitors can start a session in the same second. ga_session_number counts every "
                         "session of the visitor, from the visitor's first row in sessions (2024 on). ga_session_id, "
                         "ga_session_number and engagement_time_msec are in int_value; page_location (on www.mailvora.example, a "
                         "fictional address) and session_engaged in string_value. engagement_time_msec, on page_view, is the time spent "
                         "on that page in milliseconds: the session's next page_view comes that long after it. session_engaged is '1' "
                         "when the session has 2 or more page_view events, 10 seconds or more of engagement time, or a sign_up, and "
                         "'0' otherwise. value, on purchase only, is in double_value, or in int_value for "
                         f"{round(ga4.INT_VALUE_SHARE * 100)}% of purchases, as some tags send it."),
        "user_id": "signups.user_id as text, from the visitor's sign_up event on; missing before it and for visitors who never sign up.",
        "user_pseudo_id": ("The browser's ID: sessions.visitor_id. Missing on the website events of visitors who denied consent "
                           f"(about {round(ga4.CONSENT_DENIED_SHARE * 100)}% of events), which have no ga_session_id, "
                           "ga_session_number or user_id either. Events from Mailvora's server always carry it and user_id."),
        "traffic_source": ("How the visitor first arrived, from the visitor's first row in sessions: name is its utm_campaign, or "
                           "(organic), (referral) or (direct); medium and source are its utm_medium and utm_source, or (none) and "
                           "(direct) for direct."),
        "device": "category: desktop, mobile or tablet, from the session. Missing on events from Mailvora's server, which has no device.",
        "geo": ("country: the country's English name (Ireland, not IE), from the session's country_code; on an event from Mailvora's "
                "server, the account's country (signups.country_code)."),
        "ecommerce": ("On purchase events only: transaction_id is payments.payment_id as text, and purchase_revenue the amount in "
                      "euros. Missing on every other event. A purchase stays when its first payment was later refunded "
                      f"({refunded:,} of the {purchases:,} purchases): the export has no refund event, and payments.refunded marks "
                      "the refund."),
    }


def view_grain(con, schema: str, view: str) -> str:
    """S9-C18, L1-R2: what the view is, that it holds every Mailvora row (a wider span than events), then Mailvora's grain."""
    column = SPAN_COLUMNS[view]
    rows, first, last = con.execute(f"""SELECT count(*), strftime(CAST(min("{column}") AS DATE), '%Y-%m-%d'),
                                               strftime(CAST(max("{column}") AS DATE), '%Y-%m-%d') FROM {schema}.{view}""").fetchone()
    grain = mailvora_notes.GRAINS[view][0]
    return (f"the same as Mailvora's {view} table, here so a query can join it to events: every Mailvora row, {rows:,} rows from "
            f"{_day(first)} to {_day(last)} by {column}, a wider span than events, which covers {WINDOW_DAYS}. "
            f"{grain[0].upper()}{grain[1:]}")


def view_note(con, schema: str, view: str) -> dict:
    """A view onto Mailvora's table of its name (S9-C18): its grain, key and sample, from level 7, with the column notes true here and
    only the links to tables of this schema."""
    _, pk, fks = mailvora_notes.GRAINS[view]
    out = mailvora_notes.note(con, schema, view, view_grain(con, schema, view), pk, [f for f in fks if f["ref_table"] in ga4.VIEWS],
                              VIEW_COLUMN_NOTES[view])
    out["from_level"] = FROM_LEVEL
    return out


def schema_notes(con, schema: str) -> list[dict]:
    """events (Mailvora's shape with from_level 7: no key, as an export has none, and no link), then the four views."""
    events = mailvora_notes.note(con, schema, "events", GRAIN, [], [], events_column_notes(con, schema))
    events["from_level"] = FROM_LEVEL
    return [events] + [view_note(con, schema, v) for v in ga4.VIEWS]

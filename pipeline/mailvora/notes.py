"""Schema-panel notes for mailvora and mailvora_raw (design §11 UI: grain, keys, 1:N links, samples, allowed values; S6-20).

Mailvora arrives with level 4 (slice 5), so every table shows from level 4. The E-196 channel rule is written once, in the
sessions note (CHANNEL_RULE); P33's day rule is written once, in mailvora_raw's ad_spend_daily note (LA_DAY_RULE). The note
shape, the 1:N link and the allowed values rule (E-019) are Voltmarkt's (pipeline/voltmarkt/notes.py). A TIMESTAMPTZ value in a
sample is written as ISO text in UTC, so the notes stay JSON and need no time zone library.
"""
from __future__ import annotations

from voltmarkt.notes import allowed_values, fk, json_safe

FROM_LEVEL = 4
RAW_WARNING = "This table may hold errors."
TIMESTAMPTZ = "TIMESTAMP WITH TIME ZONE"

# E-196: exactly as a learner applies it to every session (pipeline/tests/test_mailvora.py applies it in SQL).
CHANNEL_RULE = ("The channel rule: a session with a utm_campaign takes the channel of the campaign with that utm_campaign "
                "(campaigns.channel_id); a session with a missing utm_campaign is organic when utm_medium is 'organic', referral "
                "when utm_medium is 'referral', and direct when utm_source, utm_medium and utm_campaign are all missing.")
# P33 (b): the rule that fixes Q-03-02, in one sentence, with only columns a learner sees.
LA_DAY_RULE = ("A row whose export_timezone is America/Los_Angeles carries the Los Angeles date on which its UTC day began, "
               "which is the day before, so its UTC day is spend_date plus one day.")
# Review Minor 3: the visitor_id link to signups is 1:N, but most sessions meet no signup.
VISITORS = "Most visitors never sign up, so most visitor_ids have no row in signups."
INSTANT = "A UTC instant with its time zone (TIMESTAMPTZ). For a user's local time, use AT TIME ZONE with countries.timezone."

# table -> (grain, primary key, foreign keys), in the clean schema's order.
GRAINS = {
    "channels": ("one row per marketing channel", ["channel_id"], []),
    "campaigns": ("one row per paid campaign (each has its own utm_campaign)", ["campaign_id"],
                  [fk("channel_id", "channels", "channel_id")]),
    "ad_spend_daily": ("one row per campaign per UTC day with spend", ["spend_date", "campaign_id"],
                       [fk("campaign_id", "campaigns", "campaign_id")]),
    "fx_rates_monthly": ("one row per month and currency", ["month", "currency"], []),
    "sessions": ("one row per website session (a visitor can have many sessions)", ["session_id"], [
        fk("utm_campaign", "campaigns", "utm_campaign"),
        fk("visitor_id", "signups", "visitor_id"),
        fk("country_code", "countries", "country_code"),
    ]),
    "signups": ("one row per user who signed up (visitor_id links to their sessions)", ["user_id"],
                [fk("country_code", "countries", "country_code")]),
    "activation_events": ("one row per activation event of a user (only activated users have rows)", [],
                          [fk("user_id", "signups", "user_id")]),
    "subscriptions": ("one row per paid subscription of a user (a plan change starts a new one)", ["subscription_id"],
                      [fk("user_id", "signups", "user_id")]),
    "payments": ("one row per monthly payment of a subscription", ["payment_id"],
                 [fk("subscription_id", "subscriptions", "subscription_id")]),
    "budget_monthly": ("one row per paid channel per month", ["month", "channel_id"], [fk("channel_id", "channels", "channel_id")]),
    "countries": ("one row per country", ["country_code"], []),
}

COLUMN_NOTES = {
    "ad_spend_daily": {
        "spend_date": "The UTC day of the spend.",
        "spend": "That day's spend in euros.",
        "currency": "The currency of spend: EUR on every row.",
        "export_timezone": "The time zone of the export's days: UTC on every row.",
    },
    "fx_rates_monthly": {"eur_per_unit": "Euros for one unit of the currency in that month."},
    "sessions": {"session_start": INSTANT, "visitor_id": VISITORS, "utm_campaign": CHANNEL_RULE},
    "signups": {"signup_ts": INSTANT, "country_code": "The user's country; countries.timezone gives its time zone."},
    "activation_events": {"event_ts": INSTANT,
                          "event_name": "A user is activated at their first_campaign_sent, which is always their first event."},
    "subscriptions": {"end_date": "The last day of the subscription; missing while it runs.",
                      "monthly_price_eur": "The plan's price a month in euros."},
    "payments": {"paid_at": INSTANT, "refunded": "True when the payment was refunded: leave it out of revenue."},
    "budget_monthly": {"month": "The first day of the month.", "budget_eur": "The channel's planned spend that month, in euros."},
    "countries": {"timezone": "The country's time zone, for AT TIME ZONE."},
}
# S6-20: mailvora_raw's notes keep the clean grain, keys and links after RAW_WARNING. Its column notes say what a column holds,
# and P33's rule, but do not restate the clean channel rule (raw's spellings are what a learner cleans first).
RAW_COLUMN_NOTES = {
    "ad_spend_daily": {"spend_date": LA_DAY_RULE, "spend": "The spend in the row's currency."},
    "fx_rates_monthly": COLUMN_NOTES["fx_rates_monthly"],
    "sessions": {"session_start": INSTANT, "visitor_id": VISITORS},
    "signups": {"signup_ts": INSTANT},
    "payments": COLUMN_NOTES["payments"],
}


def _select(con, schema: str, table: str) -> str:
    """The table's columns, a TIMESTAMPTZ one as ISO text in UTC."""
    cols = con.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = ? AND table_name = ? "
                       "ORDER BY ordinal_position", [schema, table]).fetchall()
    return ", ".join(f"""strftime(timezone('UTC', "{c}"), '%Y-%m-%dT%H:%M:%S+00:00') AS "{c}" """.strip() if t == TIMESTAMPTZ
                     else f'"{c}"' for c, t in cols)


def note(con, schema: str, table: str, grain: str, pk: list[str], fks: list[dict], column_notes: dict[str, str]) -> dict:
    """One table's note, in the shape of pipeline/voltmarkt/notes.note (schemas/schema-notes.ts TableNote)."""
    order = ", ".join(pk) if pk else "ALL"
    cur = con.execute(f"SELECT {_select(con, schema, table)} FROM {schema}.{table} ORDER BY {order} LIMIT 5")
    cols = [c[0] for c in cur.description]
    rows = [[json_safe(v) for v in r] for r in cur.fetchall()]
    count = con.execute(f"SELECT count(*) FROM {schema}.{table}").fetchone()[0]
    out = {"schema": schema, "table": table, "grain": grain, "primary_key": pk, "foreign_keys": fks, "row_count": count,
           "sample": {"columns": cols, "rows": rows}, "from_level": FROM_LEVEL}
    if column_notes:
        out["column_notes"] = dict(column_notes)
    values = allowed_values(con, schema, table)
    if values:
        out["allowed_values"] = values
    return out


def schema_notes(con, schema: str) -> list[dict]:
    """The clean schema's notes, in GRAINS order."""
    return [note(con, schema, t, grain, pk, fks, COLUMN_NOTES.get(t, {})) for t, (grain, pk, fks) in GRAINS.items()]


def raw_notes(con, schema: str, tables: tuple[str, ...]) -> list[dict]:
    """The raw schema's tables, in GRAINS order: RAW_WARNING, then the clean grain; the clean keys and links (what the data
    should hold); allowed values from raw's own data (it is a visible schema for level 4's raw items, S6-01)."""
    return [note(con, schema, t, f"{RAW_WARNING} {grain[0].upper()}{grain[1:]}", pk, fks, RAW_COLUMN_NOTES.get(t, {}))
            for t, (grain, pk, fks) in GRAINS.items() if t in tables]

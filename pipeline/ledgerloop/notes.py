"""Schema-panel notes for ledgerloop and ledgerloop_raw (design §11 UI: grain, keys, 1:N links, samples, allowed values; S8-01).

LedgerLoop arrives with level 6 (slice 7), so every table shows from level 6. The note shape, the 1:N link and the allowed values
rule (E-019) are Voltmarkt's (pipeline/voltmarkt/notes.py); a TIMESTAMPTZ value in a sample is written as ISO text in UTC, as
Mailvora's are (pipeline/mailvora/notes.py). S8-02's MRR rule is written once, in subscription_events.mrr_delta_local's note.
Sprint 8 Part 2 (S8-C28, E-215) adds the note of the clean schema's one view, mrr_monthly.
"""
from __future__ import annotations

from mailvora.notes import _select
from voltmarkt.notes import allowed_values, fk, json_safe

FROM_LEVEL = 6
RAW_WARNING = "This table may hold errors."
LOCAL = "Brussels local time (no time zone)."

# S8-02: the one MRR source, as a learner applies it.
MRR_RULE = ("The change in the subscription's MRR, in its currency. The sum of a subscription's changes up to a date is its MRR "
            "on that date.")
EVENT_TYPES = ("opening: the MRR a subscription already had on 2024-01-01, when the data starts (every opening event is on that "
               "day, every subscription active that day has one, and an account created before 2024 has one instead of new); "
               "new: a new account's first subscription; "
               "expansion and contraction: MRR up or down; churn: the subscription ends; reactivation: a churned account's new "
               "subscription. Leave opening out of a movement query.")

# table -> (grain, primary key, foreign keys), in the clean schema's order (CLEAN_TABLES).
GRAINS = {
    "accounts": ("one row per customer account (fictional companies)", ["account_id"], []),
    "plans": ("one row per plan and price (a price change starts a new row)", ["plan_id"], []),
    "subscriptions": ("one row per subscription (an account holds one at a time; one that comes back after churning starts a new one)",
                      ["subscription_id"], [fk("account_id", "accounts", "account_id"), fk("plan_id", "plans", "plan_id")]),
    "subscription_events": ("one row per change in a subscription's MRR", ["event_id"],
                            [fk("subscription_id", "subscriptions", "subscription_id"), fk("account_id", "accounts", "account_id")]),
    "invoices": ("one row per invoice", ["invoice_id"],
                 [fk("subscription_id", "subscriptions", "subscription_id"), fk("account_id", "accounts", "account_id")]),
    "payments": ("one row per payment attempt (a failed invoice is tried again up to three times)", ["payment_id"],
                 [fk("invoice_id", "invoices", "invoice_id")]),
    "fx_rates": ("one row per day and currency", ["rate_date", "currency"], []),
    "users": ("one row per user of an account", ["user_id"], [fk("account_id", "accounts", "account_id")]),
    "usage_weekly": ("one row per account and week it was a customer", ["account_id", "week_start"],
                     [fk("account_id", "accounts", "account_id")]),
    "support_tickets": ("one row per support ticket", ["ticket_id"], [fk("account_id", "accounts", "account_id")]),
    "marketing_spend_monthly": ("one row per month and paid media channel", ["month", "channel"], []),
    "leads": ("one row per lead (a possible customer who showed interest)", ["lead_id"], []),
    "opportunities": ("one row per sales opportunity (at most one per lead)", ["opportunity_id"],
                      [fk("lead_id", "leads", "lead_id"), fk("account_id", "accounts", "account_id")]),
    "cogs_monthly": ("one row per month and cost type (the cost of delivering the service)", ["month", "cost_type"], []),
    "sm_expense_monthly": ("one row per month, channel and cost type (sales and marketing costs other than paid media)",
                           ["month", "channel", "cost_type"], []),
    "app_events": ("one row per in-app event of a user (the accounts in the tracking rollout, October to December 2025)",
                   ["event_id"], [fk("user_id", "users", "user_id"), fk("account_id", "accounts", "account_id")]),
}

COLUMN_NOTES = {
    "accounts": {
        "account_name": "A fictional company name.",
        "created_at": f"When the account became a customer, in {LOCAL} An account created before 2024 was already a customer when the data starts.",
        "acquisition_channel": "The source of the lead that became this account; the paid ones match marketing_spend_monthly.channel.",
        "is_test": "True for an internal test account; there is none here.",
    },
    "plans": {
        "list_price_eur_month": "The list price a month in euros, before the 15% annual discount. Missing for Enterprise: each contract sets its price.",
        "valid_from": "The first day this price applies.",
        "valid_to": "The last day this price applies, missing for a current price.",
    },
    "subscriptions": {
        "plan_id": "The plan at the subscription's end, or on as_of_date (2026-01-01) while it runs: an upgrade or downgrade changes it.",
        "billing_period": "monthly, or annual: billed for a year at a time, 15% off.",
        "currency": "The currency it bills in: GBP for an account in GB, CHF in CH, EUR elsewhere. fx_rates converts it to euros.",
        "start_date": "Its first day.",
        "end_date": "The day of its churn event, the first day without it: active on a date d when start_date <= d and end_date is "
                    "missing or later than d. Missing while it runs.",
        "mrr_local": "Its MRR in its currency at its end, or on as_of_date (2026-01-01) while it runs. An annual plan's MRR is the "
                     "year's price over 12.",
    },
    "subscription_events": {
        "event_type": EVENT_TYPES,
        "event_date": "The day the change takes effect.",
        "mrr_delta_local": MRR_RULE,
        "recorded_at": f"When the change was recorded, in {LOCAL}",
    },
    "invoices": {
        "amount_local": "In the subscription's currency: a month's MRR for a monthly plan, twelve months' for an annual one, or the "
                        "rest of the year after an annual plan grows.",
        "status": "paid; uncollectible when every payment attempt failed; open while an attempt is still due.",
    },
    "payments": {
        "attempted_at": f"{LOCAL} The payment provider's instant, converted.",
        "failure_reason": "Missing when the attempt succeeded.",
    },
    "fx_rates": {"eur_per_unit": "Euros for one unit of the currency that day (1 for EUR)."},
    "users": {
        "invited_at": f"{LOCAL}",
        "deactivated_at": f"{LOCAL} Missing while the user is active.",
    },
    "usage_weekly": {
        "week_start": "The Monday the week starts on.",
        "active_users": "Users who used the product that week.",
        "ap_module_events": "Actions in the AP Automation module that week: 0 for an account not using it.",
    },
    "support_tickets": {
        "opened_at": f"{LOCAL}",
        "priority": "P1 is the most urgent, P4 the least.",
        "resolved_at": f"{LOCAL} Missing while the ticket is not resolved.",
    },
    "marketing_spend_monthly": {
        "month": "The first day of the month.",
        "spend_eur": "Paid media only. Salaries, tools and partner fees are in sm_expense_monthly.",
    },
    "leads": {
        "created_at": f"{LOCAL}",
        "source": "Where the lead came from; the paid sources match marketing_spend_monthly.channel.",
        "email": "A fictional contact address.",
    },
    "opportunities": {
        "account_id": "Set only when won: the account created on or after closed_at.",
        "created_at": f"{LOCAL}",
        "stage": "The furthest stage reached: discovery, demo, proposal, negotiation, then contract for a won deal.",
        "closed_at": f"{LOCAL} Missing while the opportunity is open.",
        "is_won": "Missing while the opportunity is open.",
        "amount_eur": "The first year's value in euros: an estimate until it is won.",
    },
    "cogs_monthly": {"month": "The first day of the month."},
    "sm_expense_monthly": {
        "month": "The first day of the month.",
        "channel": "The channel the cost belongs to; shared for a cost of every channel.",
    },
    "app_events": {
        "event_ts": "A UTC instant with its time zone (TIMESTAMPTZ). For Brussels time, use AT TIME ZONE 'Europe/Brussels'.",
    },
}
# S8-01: ledgerloop_raw's notes keep the clean grain, keys and links after RAW_WARNING. Its column notes follow Mailvora's rule:
# a column a quirk touches says only what it holds, so no clean claim the raw data breaks is repeated (Q-02-01's duplicates break
# "the sum of the changes is MRR", Q-02-03's labels "in its currency", Q-02-05's sentinel "missing while it runs", Q-02-06 the
# segment list, Q-02-07's test accounts "a customer" and "flagged"). The other eleven tables are unchanged copies, so their clean
# notes hold.
RAW_COLUMN_NOTES = {
    **{t: COLUMN_NOTES[t] for t in COLUMN_NOTES if t not in ("accounts", "subscriptions", "subscription_events", "invoices", "payments")},
    "accounts": {"account_name": "The name the CRM holds.", "segment": "The segment as the CRM holds it.",
                 "acquisition_channel": "The acquisition channel the CRM holds.",
                 "created_at": f"When the account was created in the CRM, in {LOCAL}", "is_test": "The CRM's test flag."},
    "subscriptions": {"plan_id": COLUMN_NOTES["subscriptions"]["plan_id"], "billing_period": COLUMN_NOTES["subscriptions"]["billing_period"],
                      "currency": "The currency the billing export wrote.", "start_date": "The start date the billing export wrote.",
                      "end_date": "The end date the billing export wrote.",
                      "mrr_local": "The MRR amount the billing export wrote: at the subscription's end, or on as_of_date (2026-01-01) "
                                   "while it runs."},
    "subscription_events": {"event_type": EVENT_TYPES, "event_date": COLUMN_NOTES["subscription_events"]["event_date"],
                            "mrr_delta_local": "A change in a subscription's MRR, as the billing system sent it.",
                            "recorded_at": f"When the change reached the database, in {LOCAL}"},
    "invoices": {"amount_local": "The invoiced amount.", "currency": "The currency the billing export wrote.",
                 "status": COLUMN_NOTES["invoices"]["status"]},
    "payments": {"attempted_at": "A UTC instant with its time zone (TIMESTAMPTZ), as the payment provider sends it.",
                 "failure_reason": COLUMN_NOTES["payments"]["failure_reason"]},
}

# Sprint 8 Part 2 (S8-C28, E-215): the mrr_monthly view, which the build makes in ledgerloop (build_course_db.MRR_MONTHLY_SQL). Its
# note says what one row is, that a month with no row means no MRR, that new comes from the events (E-216), and the rate rule. It shows
# from level 6, like every table here.
MRR_MONTHLY_VIEW = ("one row per account and calendar month, January 2024 to December 2025, in which the account had MRR on the "
                    "month's last day (a month with no row means no MRR)",
                    ["account_id", "month"], [fk("account_id", "accounts", "account_id")])
MRR_MONTHLY_NOTES = {
    "account_id": "An account with no row in a month had no MRR on its last day: one missing after a month with a row has churned, "
                  "and one that comes back after such a gap is a reactivation, never a new account. Whether an account is new comes "
                  "from subscription_events (event_type new), never from its first row here.",
    "month": "The first day of the month. The MRR is the one in force on the month's last day.",
    "mrr_eur": "The account's MRR in euros: the sum of mrr_delta_local over its subscription events up to the month's last day, "
               "opening events included. A GBP or CHF amount is converted at its currency's last rate in fx_rates, the rate of "
               "2025-12-31, in every month, so the months add up and only MRR moves them. Rounded to the cent.",
}


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


def view_notes(con, schema: str) -> list[dict]:
    """The clean schema's view, mrr_monthly (E-215): it comes after the tables, as Voltmarkt's views do. ledgerloop_raw has no view,
    and an edge schema no note."""
    return [note(con, schema, "mrr_monthly", *MRR_MONTHLY_VIEW, MRR_MONTHLY_NOTES)]


def raw_notes(con, schema: str, tables: tuple[str, ...]) -> list[dict]:
    """The raw schema's tables, in GRAINS order: RAW_WARNING, then the clean grain; the clean keys and links (what the data should
    hold); allowed values from raw's own data."""
    return [note(con, schema, t, f"{RAW_WARNING} {grain[0].upper()}{grain[1:]}", pk, fks, RAW_COLUMN_NOTES.get(t, {}))
            for t, (grain, pk, fks) in GRAINS.items() if t in tables]

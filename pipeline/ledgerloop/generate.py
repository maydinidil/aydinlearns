"""LedgerLoop (knowledge/05 CO-02) generator: sprint 8, Task L1 (S8-01 to S8-06; E-015, E-080, E-084, E-087, E-089, E-104, E-208).

GEN-01: generate() returns the clean and raw tables as pyarrow Tables with the truth; validate() measures every planted finding in
SQL and raises ValueError, naming it, on the first one outside 05's band. GEN-02: one child Generator per entry of TABLE_ORDER,
spawned from SeedSequence(2202) in 05's CO-02 generation order with S8-01's five tables appended, so changing one table never
shifts another; nothing here touches Voltmarkt's or Mailvora's streams. GEN-03: the plants are the constants below. GEN-04: the
clean tables first, then raw.inject_quirks() on copies. OD-GEN-01: the truth goes to data/truth/ledgerloop.json only.

The model, in 05's order:
- Daily FX rates for EUR (1), GBP and CHF. A subscription bills in its account's currency (GB in GBP, CH in CHF, the rest in EUR)
  at the local price book below; EUR comes from fx_rates (FIND-02-11).
- Accounts: legacy accounts, created 2019 to 2023 and active on 2024-01-01, drawn until their MRR on 2024-01-01 reaches the
  opening target (E-015), then the accounts won in the window, month by month.
- Subscriptions and their events, one monthly loop (S8-02, the one MRR source): the sum of a subscription's mrr_delta_local up to
  a date is its MRR in force then. Legacy subscriptions open with an `opening` event on 2024-01-01 (S8-03: never `new`); a won
  account starts with `new`; a churned account that comes back starts a new subscription with `reactivation`. Monthly plans
  renew on the day of their start each month, annual plans each year (MRR is the year's price, 15% off, over 12; they churn,
  contract and take the Starter rise only on a renewal: E-104). At a renewal: voluntary churn, the Starter price rise from
  2025-02-01, a contraction, the invoice and its payment; an invoice whose four attempts all fail ends the subscription 21 days
  later (involuntary churn, FIND-02-08). Inside a month: expansions (an add-on, an upgrade or seats; 1.5% a month, x2.5 for AP
  Automation users). Counts are drawn as quotas per segment and billing period, each month's fraction carried to the next, so
  05's rates hold month by month (FIND-02-05's mid-market churn is a handful of accounts a month).
- Users, weekly usage (decaying over the 8 weeks before a voluntary churn: FIND-02-09; AP events for AP users: FIND-02-10),
  invoices and payment attempts (UTC instants, written as Brussels wall-clock time in clean: Q-02-04 is raw's), support tickets
  (P1 bursts before a voluntary churn and slow P1 fixes in Q3 2025: FIND-02-14), and paid media by channel (FIND-02-15).
- S8-01's appended tables: the lead funnel back-filled before each won account (S8-05), the cost tables (S8-05, E-087) and
  app_events in UTC for Q4 2025 (S8-06).
Every rate, size and weight below is a calibration estimate chosen so that 05's findings hold, unless a comment cites 05 or a
ruling. S8-04 (E-084): 05's list prices are kept; the volumes they cannot hold are declared in S8_04_VOLUMES.
"""
from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, field

import duckdb
import numpy as np
import pyarrow as pa

SEED = 2202                                              # 05 §5: CO-02's seed
TABLE_ORDER = ["calendar", "fx_rates", "plans", "accounts", "subscriptions_and_events", "users", "usage_weekly", "invoices",
               "payments", "support_tickets", "marketing_spend_monthly", "quirks",
               "leads", "opportunities", "cogs_monthly", "sm_expense_monthly", "app_events"]   # 05's CO-02 order, then S8-01's
CLEAN_TABLES = ("accounts", "plans", "subscriptions", "subscription_events", "invoices", "payments", "fx_rates", "users",
                "usage_weekly", "support_tickets", "marketing_spend_monthly", "leads", "opportunities", "cogs_monthly",
                "sm_expense_monthly", "app_events")
WINDOW_START = dt.date(2024, 1, 1)
WINDOW_END = dt.date(2025, 12, 31)
AS_OF = dt.date(2026, 1, 1)
AS_OF_DATE = AS_OF.isoformat()                           # design §10: just after the data window
DAYS = (WINDOW_END - WINDOW_START).days + 1             # 731
EPOCH = dt.date(1970, 1, 1)
NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17
MONTH_STARTS = [dt.date(2024 + i // 12, i % 12 + 1, 1) for i in range(24)]
MONTH_ENDS = [(MONTH_STARTS[i + 1] if i < 23 else AS_OF) - dt.timedelta(1) for i in range(24)]
WEEK_STARTS = [WINDOW_START + dt.timedelta(7 * k) for k in range(105)]   # every Monday, 2024-01-01 to 2025-12-29

# ---- S8-04 (E-084): the volumes 05's list prices, FIND-02-01 and the ARR path cannot hold -------------------------------------
# With Starter at 290 to 349 EUR, Scale at 2,400 and Enterprise at 5,000 to 20,000, an MRR of about EUR 0.9M rising to about
# EUR 1.6M with Scale plus Enterprise at about 20% of logos and 60% of MRR leaves room for about 800 paying accounts at the start
# and 1,150 at the end, not the 2,200 or more that 05's 230,000 usage weeks and 70,000 invoices need. Counts and mix change; the
# list prices never do. The rows below are each table's count as built (seed 2202); the tests hold it to within 10%.
_WHY = ("05's list prices with FIND-02-01 (Scale plus Enterprise about 20% of logos, 60% of MRR) and the MRR path (about EUR 0.9M "
        "to 1.6M) leave room for about 800 paying accounts on 2024-01-01 and 1,150 on 2025-12-31, not the 2,200 or more CO-02's "
        "volumes assume (E-084)")
S8_04_VOLUMES = {
    "accounts": {"rows": 1450, "why": _WHY + "; every account was a customer in the window"},
    "plans": {"rows": 6, "why": "05 names five plans and one price change (Starter 290 then 349), so six price rows, not eight"},
    "subscriptions": {"rows": 1550, "why": _WHY + "; an account holds one subscription at a time, plus its reactivations"},
    "subscription_events": {"rows": 3100, "why": _WHY + "; at 05's churn and expansion rates such a base makes about 3,100 "
                                                         "events, so Q-02-01's 180 to 240 duplicates (FIND-02-13) are about 7% of "
                                                         "them, not 05's 1.5%"},
    "invoices": {"rows": 18000, "why": _WHY + "; one invoice a month for a monthly plan and one a year for an annual one"},
    "payments": {"rows": 19500, "why": _WHY + "; one attempt for most invoices, up to four for a failed one (05: 4% fail, 3 retries)"},
    "usage_weekly": {"rows": 102000, "why": _WHY + "; one row per active account and week"},
}

# ---- currencies and prices (05 CO-02; S8-04 keeps every EUR list price) -------------------------------------------------------
STARTER, GROWTH, SCALE, ENTERPRISE = range(4)
PRICE_RISE = dt.date(2025, 2, 1)                         # 05: Starter 290 to 349 EUR on 2025-02-01, at renewal
ANNUAL_PCT = 85                                          # 05: annual billing 15% off; MRR is the year's price over 12
# Each currency's price book a month, in whole units: 05's EUR list prices, and GBP and CHF prices near them at the window's rates.
PRICE_BOOK = {
    "EUR": {"starter": (290, 349), "growth": 890, "scale": 2400, "addon": 300},
    "GBP": {"starter": (249, 299), "growth": 769, "scale": 2069, "addon": 259},
    "CHF": {"starter": (279, 335), "growth": 855, "scale": 2299, "addon": 289},
}
ENTERPRISE_LOCAL = {"EUR": 1.0, "GBP": 0.86, "CHF": 0.96}  # a custom EUR price in the local currency
PLAN_ROWS = (   # plan_id, plan_name, list_price_eur_month (None: custom), valid_from, valid_to (both days included)
    (1, "Starter", 290, "2019-01-01", "2025-01-31"),
    (2, "Starter", 349, "2025-02-01", None),
    (3, "Growth", 890, "2019-01-01", None),
    (4, "Scale", 2400, "2019-01-01", None),
    (5, "Enterprise", None, "2019-01-01", None),
    (6, "AP Automation", 300, "2022-03-01", None),       # the add-on: part of a subscription's MRR, never its plan
)
FX_ANCHORS = {   # mid-month EUR per unit, 2024-01 to 2025-12 (fictional, near the period's levels)
    "GBP": (1.163, 1.169, 1.170, 1.168, 1.172, 1.181, 1.183, 1.172, 1.191, 1.197, 1.200, 1.205,
            1.200, 1.208, 1.193, 1.176, 1.186, 1.180, 1.162, 1.157, 1.153, 1.141, 1.137, 1.142),
    "CHF": (1.072, 1.051, 1.042, 1.019, 1.009, 1.037, 1.044, 1.072, 1.065, 1.068, 1.066, 1.069,
            1.069, 1.059, 1.046, 1.072, 1.065, 1.068, 1.074, 1.071, 1.070, 1.076, 1.077, 1.072),
}
CURRENCIES = ("CHF", "EUR", "GBP")

# ---- accounts ---------------------------------------------------------------------------------------------------------------
COUNTRIES = ("DE", "NL", "BE", "FR", "GB", "CH")
COUNTRY_MIX = (0.25, 0.18, 0.14, 0.14, 0.17, 0.12)
CURRENCY_OF = {"GB": "GBP", "CH": "CHF"}                 # 05: UK billed in GBP, CH in CHF; every other country in EUR
SEGMENTS = ("SMB", "Mid-Market", "Enterprise")
SMB, MM, ENT = range(3)
SEGMENT_MIX = (0.60, 0.30, 0.10)                         # 05 CO-02
CHANNELS = ("paid_search", "paid_social", "review_sites", "display", "events", "organic", "referral", "partner", "outbound")
PAID_MEDIA = ("paid_search", "paid_social", "review_sites", "display", "events")    # marketing_spend_monthly's channels
CHANNEL_MIX = {
    SMB: (0.30, 0.10, 0.17, 0.04, 0.01, 0.22, 0.08, 0.06, 0.02),
    MM: (0.17, 0.14, 0.07, 0.03, 0.07, 0.12, 0.09, 0.20, 0.11),
    ENT: (0.03, 0.08, 0.01, 0.01, 0.20, 0.05, 0.10, 0.22, 0.30),
}
INDUSTRIES = ("retail", "wholesale", "manufacturing", "logistics", "construction", "hospitality", "healthcare",
              "professional_services", "technology", "nonprofit")
EMPLOYEE_BANDS = {SMB: (("1-10", 0.35), ("11-50", 0.65)), MM: (("51-200", 0.70), ("201-500", 0.30)),
                  ENT: (("501-1000", 0.55), ("1001+", 0.45))}
LEGACY_YEARS = ((2019, 0.08), (2020, 0.12), (2021, 0.18), (2022, 0.26), (2023, 0.36))
LEGACY_POOL = 2200                                       # legacy candidates; the first ones up to OPENING_TARGET_EUR are kept
OPENING_TARGET_EUR = 900_000                             # E-015: about EUR 0.9M MRR on 2024-01-01 (band 0.85M to 0.95M)
FIRST_WIN = dt.date(2024, 1, 2)                          # S8-02: no account is won on 2024-01-01, so every subscription active
                                                         # that day opens with a balance and MRR that day is the opening events' sum
NEW_BASE = 26.0                                          # accounts won a month at the window's start
NEW_GROWTH = 0.30                                        # ... rising 30% over the window
NEW_SEASON = (1.15, 1.0, 1.05, 0.95, 1.0, 0.95, 0.75, 0.70, 1.10, 1.10, 1.05, 0.80)
NEW_SLUMP = {13: 0.40, 14: 0.40, 15: 0.45}               # fewer wins in Feb to Apr 2025 (05: a flat Feb-Apr 2025)
WEEKDAY_WEIGHT = (1.0, 1.0, 1.0, 1.0, 0.9, 0.12, 0.04)
NAME_PREFIXES = ("Noorder", "Zuider", "Ooster", "Rijnland", "Maasland", "Schelde", "Alpen", "Hanse", "Brabant", "Ardennen",
                 "Elbe", "Loire", "Thames", "Jura", "Bodensee", "Polder", "Duinen", "Havenstad", "Lindeboom", "Eikenhof", "Bergland",
                 "Veldhoven", "Brugge", "Kanaal", "Sternberg", "Lichtveld", "Blauwe", "Groene", "Zilver", "Gouden", "Zonnig",
                 "Windkracht", "Kustlijn", "Dalwerk", "Merwede", "Kempen", "Veluwe", "Eifel", "Mosel", "Seine", "Rhone", "Severn",
                 "Pennine", "Ticino", "Aare", "Limmat", "Leman", "Saane", "Isar", "Spree", "Weser", "Ems", "Ijssel", "Vecht",
                 "Amstel", "Dommel", "Dijle", "Leie", "Senne", "Ourthe", "Meuse", "Somme", "Marne", "Garonne", "Cotswold",
                 "Mersey", "Tyne", "Clyde", "Avon", "Kennet")
NAME_STEMS = ("Logistics", "Foods", "Trading", "Bouw", "Metaal", "Zorg", "Consulting", "Media", "Technik", "Textiel", "Hotels",
              "Pharma", "Energie", "Transport", "Holding", "Groep", "Services", "Systems", "Partners", "Distributie", "Retail",
              "Installaties", "Maschinenbau", "Handel", "Bakkerij", "Brouwerij", "Drukkerij", "Uitzend", "Facilitair", "Vastgoed",
              "Accountants", "Advocaten", "Labs", "Software", "Studio", "Mobility", "Packaging", "Agri", "Medical", "Optics",
              "Interiors", "Garden", "Marine", "Aviation", "Robotics")
LEGAL = {"DE": ("GmbH",), "NL": ("B.V.",), "BE": ("NV", "BV", "SRL"), "FR": ("SAS", "SARL"), "GB": ("Ltd",), "CH": ("AG", "GmbH")}

# ---- subscriptions and events ------------------------------------------------------------------------------------------------
TIER_MIX = {SMB: (0.80, 0.20, 0.0, 0.0), MM: (0.0, 0.78, 0.22, 0.0), ENT: (0.0, 0.0, 0.55, 0.45)}   # legacy accounts on 2024-01-01
NEW_TIER_MIX = {SMB: (0.80, 0.20, 0.0, 0.0), MM: (0.0, 0.80, 0.20, 0.0), ENT: (0.0, 0.0, 0.80, 0.20)}   # new ones land small and expand
MIN_TIER = {SMB: STARTER, MM: GROWTH, ENT: SCALE}         # a downgrade or a return never goes below a segment's entry plan
ANNUAL_SHARE = (0.22, 0.30, 0.22, 0.22)                  # by tier
LEGACY_ADDON = (0.12, 0.30, 0.40, 0.50)                  # the AP Automation add-on on 2024-01-01, by tier
LEGACY_EXTRA = {SCALE: (0.0, 0.40), ENTERPRISE: (0.0, 0.0)}   # extra seats on Scale, as a share of its price
NEW_EXTRA = {SCALE: (0.0, 0.20)}
ENTERPRISE_EUR = (5000, 1000.0, 1.4, 20000)              # 05: custom, 5,000 to 20,000 EUR: floor + gamma(shape, scale), cap
ADOPTER_SHARE = {SMB: 0.30, MM: 0.40, ENT: 0.50}         # new accounts that use AP Automation in their first 90 days
TRIAL_BUY = 0.70                                         # ... and buy the add-on when the 90-day trial ends
BASE_CHURN = {SMB: 0.025, MM: 0.012, ENT: 0.005}         # 05: monthly churn by segment (voluntary plus involuntary)
VOLUNTARY_SHARE = 0.80                                   # the voluntary part of 05's rates; failed payments make the rest
EARLY_CHURN = 1.8                                        # 05: months 1 to 3 x1.8
TIER_CHURN = (1.0, 0.72, 0.33, 0.20)                     # monthly plans, by plan: a Scale or Enterprise contract churns less
ADOPTER_CHURN = 0.35                                     # an early AP Automation user stays longer
ANNUAL_RENEWAL_CHURN = 0.12                              # 05: annual renewal churn 12% (E-104)
STARTER_SPIKE = {13: 1.8, 14: 3.9, 15: 2.2, 16: 1.8}     # 05: Starter churn x2.0 in Feb-May 2025 as customers meet the 349 price,
                                                         # peaking in March; on the voluntary part, so SMB Starter churn about doubles
EXPANSION = 0.015                                        # 05: expansion 1.5% a month
ADOPTER_EXPANSION = 2.5                                  # 05: x2.5 for AP Automation users
ADOPTER_SEATS = 1.8                                      # ... whose seat expansions are larger too
ADDON_FIRST = (0.6, 0.6, 0.25, 0.25)                      # by plan: an expansion without the add-on buys it first this often
UPGRADE = {"growth_to_scale": 0.30, "scale_to_enterprise": 0.06}   # an expansion that moves a plan up
UPGRADE_FLOOR = 1.2                                      # an upgrade is at least 20% above what the plan and its seats cost
SEAT_GROWTH = {"growth": (0.30, 0.70), "scale": (0.45, 1.20), "enterprise": (0.25, 0.50)}   # otherwise more seats: a share of the price
CONTRACTION_MONTHLY = 0.024                              # a monthly plan's chance to contract at a renewal (S8-02: seat cuts, downgrades)
CONTRACTION_ANNUAL = 0.08                                # ... an annual plan's, at its yearly renewal
CONTRACTION_MIX = {"addon": 0.25, "down": 0.05, "seats": 0.70}
SEAT_CUT = (0.10, 0.25)                                  # a seat cut removes this share of the extra seats (or of a contract)
INVOICE_FAIL = 0.04                                      # 05: a payment failure rate of 4% per invoice, with 3 retries
FULL_FAIL = {SMB: 0.14, MM: 0.07, ENT: 0.03}             # the share of failed invoices whose three retries fail too
DUNNING_DAYS = 21                                        # attempts on days 0, 3, 7 and 14; the subscription ends on day 21
RETRY_DAYS = (0, 3, 7, 14)
REACTIVATION = {"voluntary": 0.32, "involuntary": 0.40}  # a churned account comes back (S8-02: at least 60 in the window)
REACTIVATION_GAP = {"voluntary": (45, 300), "involuntary": (14, 120)}
PLANTS = {
    "opening_target_eur": OPENING_TARGET_EUR,
    "price_rise": {"plan": "Starter", "from_eur": 290, "to_eur": 349, "date": PRICE_RISE.isoformat(), "at": "renewal",
                   "churn_multiplier_by_month": {f"2025-{m - 11:02d}": x for m, x in STARTER_SPIKE.items()}},   # 05
    "march_2025_exits": {"month": "2025-03", "accounts": 2, "segment": "Enterprise", "tier": "Enterprise"},   # the two largest renewing then end
    "p1_backlog": {"quarter": "2025-Q3", "resolution_multiplier": 2.3},             # FIND-02-14
    "usage_decay": {"weeks_before_voluntary_churn": 8, "to_share": 0.25},          # 05: usage decay 8 weeks before churn
    "involuntary_churn": {"failed_attempts": 4, "days_after_invoice": DUNNING_DAYS},  # FIND-02-08
    "payback_months": {"partner": 7.0, "paid_search": 20.0, "paid_social": 15.0, "review_sites": 11.0, "display": 24.0,
                       "events": 14.0},                                            # FIND-02-15
    "gross_margin": 0.78,
}

# ---- users, usage, tickets ------------------------------------------------------------------------------------------------------
SEATS = {(SMB, STARTER): (2, 5), (SMB, GROWTH): (4, 9), (SMB, SCALE): (6, 12), (MM, GROWTH): (6, 14), (MM, SCALE): (10, 24),
         (MM, ENTERPRISE): (20, 40), (ENT, SCALE): (18, 40), (ENT, ENTERPRISE): (35, 90), (MM, STARTER): (3, 6),
         (ENT, GROWTH): (10, 20), (ENT, STARTER): (4, 8), (SMB, ENTERPRISE): (10, 20)}
USER_GROWTH = {SMB: 0.04, MM: 0.16, ENT: 0.45}           # users invited a month beyond the first ones
USER_TENURE_MONTHS = 38.0                                # mean tenure of a user before deactivation
USER_REPLACE = 0.75
ROLES = (("accountant", 0.36), ("controller", 0.15), ("approver", 0.20), ("viewer", 0.19), ("admin", 0.05), ("auditor", 0.05))
ENGAGEMENT = (8.0, 2.0)                                  # Beta(a, b): an account's share of users active in a week
RECON_RATE = (3.0, 5.0, 8.0, 11.0)                       # reconciliations a week per active user, by tier
AP_RATE = 3.0                                            # AP module events a week per active user, while AP is in use
HOLIDAY_WEEKS = {"2024-12-23": 0.62, "2024-12-30": 0.62, "2025-12-22": 0.62, "2025-12-29": 0.62}
SUMMER_FACTOR = 0.80                                     # weeks starting in August
USAGE_DIPS = (0.04, (3, 6), (0.25, 0.45))                # an account-quarter with a dip (a reorganisation, a busy close): share, weeks, level
TICKET_RATE = {SMB: 0.48, MM: 1.15, ENT: 2.6}            # tickets a month per active account
PRIORITIES = (("P1", 0.05), ("P2", 0.20), ("P3", 0.45), ("P4", 0.30))
CATEGORIES = (("bank_feeds", 0.24), ("reconciliation", 0.22), ("ap_automation", 0.10), ("billing", 0.10), ("integrations", 0.14),
              ("access", 0.08), ("reporting", 0.12))
RESOLUTION_HOURS = {"P1": (5.0, 0.55), "P2": (18.0, 0.7), "P3": (52.0, 0.8), "P4": (100.0, 0.8)}   # lognormal median, sigma
UNRESOLVED = 0.012
CHURN_P1 = (2.6, 110, 15)                                # extra P1s before a voluntary churn: Poisson mean, from and to days before
P1_STORMS = (0.08, 3.5)                                  # an account-quarter with an incident: share, extra P1s (Poisson mean)

# ---- the funnel, costs and app events --------------------------------------------------------------------------------------------
WIN_RATE = {SMB: 0.30, MM: 0.22, ENT: 0.18}
OPP_RATE = {SMB: 0.15, MM: 0.24, ENT: 0.34}              # leads that become an opportunity
CYCLE_DAYS = {SMB: (5, 30), MM: (20, 75), ENT: (45, 140)}
STAGES = ("discovery", "demo", "proposal", "negotiation", "contract")   # a won opportunity reaches contract
LOST_AT = ((0, 0.35), (1, 0.30), (2, 0.20), (3, 0.15))
EMAIL_ROLES = ("finance", "cfo", "controller", "accounting", "ap", "office", "admin", "info")
COGS_TYPES = (("hosting", 0.34), ("bank_data_feeds", 0.26), ("support_staff", 0.30), ("payment_fees", 0.10))
SM_FIXED = {   # (channel, cost_type): EUR a month at the window's start, growing 20% over it ('shared': no single channel)
    ("partner", "salaries"): 9500.0, ("outbound", "salaries"): 34000.0, ("outbound", "tools"): 2600.0,
    ("paid_search", "tools"): 3200.0, ("events", "salaries"): 7000.0, ("shared", "salaries"): 118000.0, ("shared", "tools"): 9000.0,
}
APP_TARGET = 150_000                                     # S8-06: about 150,000 events; tracked accounts are drawn until their expected events reach it
APP_SESSIONS = 1.1                                       # sessions a week per active user beyond the first (Poisson mean)
APP_EVENTS = 0.22                                        # a session holds 2 plus a geometric(0.22) number of events
APP_NAMES = ("view_dashboard", "open_reconciliation", "match_transaction", "approve_bill", "upload_statement", "export_report",
             "create_rule", "add_comment", "scan_invoice")
APP_WINDOW = (dt.date(2025, 10, 1), dt.date(2025, 12, 31))


def rngs(seed: int = SEED) -> dict[str, np.random.Generator]:
    children = np.random.SeedSequence(seed).spawn(len(TABLE_ORDER))
    return {name: np.random.default_rng(child) for name, child in zip(TABLE_ORDER, children)}


# ---- small helpers ----------------------------------------------------------------------------------------------------------

def add_months(day: dt.date, months: int) -> dt.date:
    y, m = divmod(day.month - 1 + months, 12)
    year, month = day.year + y, m + 1
    nxt = dt.date(year + (month == 12), month % 12 + 1, 1)
    return dt.date(year, month, min(day.day, (nxt - dt.timedelta(1)).day))


def month_of(day: dt.date) -> int:
    return (day.year - 2024) * 12 + day.month - 1


def seconds(day: dt.date) -> int:
    return (day - EPOCH).days * 86400


def stochastic_round(rng: np.random.Generator, x: float) -> int:
    base = int(np.floor(x))
    return base + int(rng.random() < x - base)


def pick(rng: np.random.Generator, options, size: int) -> np.ndarray:
    p = np.array([w for _, w in options], dtype=float)
    return rng.choice(len(options), size=size, p=p / p.sum())


def pick_index(rng: np.random.Generator, weights, size: int) -> np.ndarray:
    p = np.asarray(weights, dtype=float)
    return rng.choice(len(p), size=size, p=p / p.sum())


def decimal_array(cents, precision: int, scale: int) -> pa.Array:
    """DECIMAL(precision, scale) from whole units of 10 ** -scale (little-endian 128-bit), missing where None."""
    values = list(cents)
    mask = np.array([v is None for v in values])
    c = np.ascontiguousarray([0 if v is None else int(v) for v in values], dtype=np.int64)
    words = np.empty((len(c), 2), dtype=np.int64)
    words[:, 0] = c
    words[:, 1] = np.where(c < 0, -1, 0)
    validity = pa.array(~mask).buffers()[1] if mask.any() else None
    return pa.Array.from_buffers(pa.decimal128(precision, scale), len(c), [validity, pa.py_buffer(words.tobytes())],
                                 null_count=int(mask.sum()))


def local_ts(secs) -> pa.Array:
    """TIMESTAMP (Brussels wall-clock time, no zone) from seconds since 1970, missing where None."""
    return pa.array([None if s is None else int(s) * 1_000_000 for s in secs], pa.timestamp("us"))


def utc_ts(secs) -> pa.Array:
    """TIMESTAMPTZ (UTC) from seconds since 1970."""
    return pa.array(np.asarray(secs, dtype=np.int64) * 1_000_000, pa.timestamp("us", tz="UTC"))


def date_array(days) -> pa.Array:
    return pa.array(list(days), pa.date32())


def _last_sunday(year: int, month: int) -> dt.date:
    d = (dt.date(year, month + 1, 1) if month < 12 else dt.date(year + 1, 1, 1)) - dt.timedelta(1)
    return d - dt.timedelta((d.weekday() + 1) % 7)


# Europe/Brussels: UTC+2 from 01:00 UTC on the last Sunday of March to 01:00 UTC on the last Sunday of October, else UTC+1.
SUMMER = {y: (seconds(_last_sunday(y, 3)) + 3600, seconds(_last_sunday(y, 10)) + 3600) for y in range(2017, 2028)}


def brussels_offset(utc_secs: np.ndarray) -> np.ndarray:
    utc_secs = np.asarray(utc_secs, dtype=np.int64)
    years = utc_secs.astype("datetime64[s]").astype("datetime64[Y]").astype(np.int64) + 1970
    start = np.array([SUMMER[y][0] for y in years], dtype=np.int64)
    end = np.array([SUMMER[y][1] for y in years], dtype=np.int64)
    return np.where((utc_secs >= start) & (utc_secs < end), 7200, 3600)


def local_to_utc_safe(local_secs: np.ndarray) -> np.ndarray:
    """A Brussels wall-clock time at 03:00 or later to UTC (no such time is missing or repeated at a clock change): its offset is
    the one in force two hours before it, read as UTC."""
    local_secs = np.asarray(local_secs, dtype=np.int64)
    return local_secs - brussels_offset(local_secs - 7200)


# ---- fx and plans ------------------------------------------------------------------------------------------------------------

def build_fx(rng: np.random.Generator) -> tuple[pa.Table, dict]:
    """Daily EUR per unit: the monthly anchors interpolated, plus a small mean-reverting wobble; EUR is 1."""
    mid = np.array([(dt.date(2024 + i // 12, i % 12 + 1, 15) - WINDOW_START).days for i in range(24)])
    rates = {"EUR": np.ones(DAYS)}
    for cur in ("GBP", "CHF"):
        base = np.interp(np.arange(DAYS), mid, FX_ANCHORS[cur])
        wobble = np.zeros(DAYS)
        for d in range(1, DAYS):
            wobble[d] = 0.85 * wobble[d - 1] + rng.normal(0, 0.0018)
        rates[cur] = np.round(base * (1 + wobble), 6)
    day_list, cur_list, units = [], [], []
    for d in range(DAYS):
        for cur in CURRENCIES:
            day_list.append(WINDOW_START + dt.timedelta(d))
            cur_list.append(cur)
            units.append(int(round(rates[cur][d] * 1_000_000)))
    table = pa.table({"rate_date": date_array(day_list), "currency": pa.array(cur_list, pa.string()),
                      "eur_per_unit": decimal_array(units, 12, 6)})
    return table, {cur: np.array([u / 1_000_000 for u in units[i::3]]) for i, cur in enumerate(CURRENCIES)}


def build_plans() -> pa.Table:
    return pa.table({
        "plan_id": pa.array([p[0] for p in PLAN_ROWS], pa.int32()),
        "plan_name": pa.array([p[1] for p in PLAN_ROWS], pa.string()),
        "list_price_eur_month": decimal_array([None if p[2] is None else p[2] * 100 for p in PLAN_ROWS], 10, 2),
        "valid_from": date_array([dt.date.fromisoformat(p[3]) for p in PLAN_ROWS]),
        "valid_to": date_array([None if p[4] is None else dt.date.fromisoformat(p[4]) for p in PLAN_ROWS]),
    })


# ---- accounts ----------------------------------------------------------------------------------------------------------------

def _business_seconds(rng: np.random.Generator, n: int, start_hour: float, end_hour: float) -> np.ndarray:
    return np.round(rng.uniform(start_hour, end_hour, n) * 3600).astype(np.int64)


def _days_in_month(rng: np.random.Generator, m: int, n: int, earliest: dt.date = WINDOW_START) -> list[dt.date]:
    first, last = max(MONTH_STARTS[m], earliest), MONTH_ENDS[m]
    days = [first + dt.timedelta(k) for k in range((last - first).days + 1)]
    w = np.array([WEEKDAY_WEIGHT[d.weekday()] for d in days])
    return [days[i] for i in rng.choice(len(days), size=n, p=w / w.sum())]


def _company_names(rng: np.random.Generator, countries: np.ndarray) -> list[str]:
    """Unique fictional company names: a place word and a trade word no other account has, and the country's legal form."""
    combos = rng.choice(len(NAME_PREFIXES) * len(NAME_STEMS), size=len(countries), replace=False)
    names = []
    for c, k in zip(countries, combos):
        p, s = divmod(int(k), len(NAME_STEMS))
        legal = LEGAL[c]
        names.append(f"{NAME_PREFIXES[p]} {NAME_STEMS[s]} {legal[int(rng.integers(len(legal)))]}")
    return names


def draw_accounts(rng: np.random.Generator) -> dict:
    """Every candidate account: the legacy pool (created 2019 to 2023), then the accounts won in each month of the window."""
    counts = []
    for m in range(24):
        expected = NEW_BASE * (1 + NEW_GROWTH * m / 23) * NEW_SEASON[m % 12] * NEW_SLUMP.get(m, 1.0)
        counts.append(stochastic_round(rng, expected))
    n_new = sum(counts)
    n = LEGACY_POOL + n_new
    seg = pick(rng, [(s, w) for s, w in zip(SEGMENTS, SEGMENT_MIX)], n)
    country = np.array(COUNTRIES)[pick(rng, [(c, w) for c, w in zip(COUNTRIES, COUNTRY_MIX)], n)]
    channel = np.array([CHANNELS[pick_index(rng, CHANNEL_MIX[int(s)], 1)[0]] for s in seg])
    industry = np.array(INDUSTRIES)[rng.integers(0, len(INDUSTRIES), n)]
    band = np.array([EMPLOYEE_BANDS[int(s)][pick(rng, EMPLOYEE_BANDS[int(s)], 1)[0]][0] for s in seg])
    created = []
    years = pick(rng, LEGACY_YEARS, LEGACY_POOL)
    for y in years:
        year = LEGACY_YEARS[y][0]
        start = dt.date(year, 1, 1)
        span = (dt.date(year, 12, 31) - start).days
        day = start + dt.timedelta(int(rng.integers(0, span + 1)))
        created.append(seconds(day) + int(_business_seconds(rng, 1, 8.0, 18.5)[0]))
    month = [-1] * LEGACY_POOL
    for m, c in enumerate(counts):
        for day in _days_in_month(rng, m, c, FIRST_WIN):
            created.append(seconds(day) + int(_business_seconds(rng, 1, 8.0, 18.5)[0]))
            month.append(m)
    names = _company_names(rng, country)
    return {"segment": seg, "country": country, "channel": channel, "industry": industry, "band": band,
            "created": np.array(created, dtype=np.int64), "month": np.array(month), "name": names, "n_legacy_pool": LEGACY_POOL}


# ---- the subscription simulation (S8-02) ---------------------------------------------------------------------------------------

@dataclass
class Sub:
    account: int
    tier: int
    billing: str
    currency: str
    start: dt.date
    kind: str                                    # opening, new or reactivation: its first event
    risen: bool = False                          # Starter at the 349 price
    addon: bool = False
    extra: int = 0                               # extra seats, local cents a month before the annual discount
    custom: int = 0                              # an Enterprise contract's price, local cents a month
    end: dt.date | None = None
    end_kind: str | None = None
    dunning: dt.date | None = None
    mrr: int = 0
    events: list = field(default_factory=list)   # (date, type, delta cents, seconds of the day)
    invoices: list = field(default_factory=list)  # (date, kind, full fail, prorated cents or None)
    addon_spans: list = field(default_factory=list)  # [from, to) dates with the add-on
    addon_from: dt.date | None = None


@dataclass
class Account:
    segment: int
    currency: str
    created: dt.date
    legacy: bool
    adopter: bool = False                        # uses AP Automation: x2.5 expansion (05)
    early: bool = False                          # a new account that adopted AP in its first 90 days (FIND-02-10)
    subs: list = field(default_factory=list)


def base_cents(s: Sub) -> int:
    book = PRICE_BOOK[s.currency]
    if s.tier == ENTERPRISE:
        return s.custom
    if s.tier == STARTER:
        return book["starter"][1 if s.risen else 0] * 100
    return book["growth" if s.tier == GROWTH else "scale"] * 100


def mrr_of(s: Sub) -> int:
    total = base_cents(s) + (PRICE_BOOK[s.currency]["addon"] * 100 if s.addon else 0) + s.extra
    return (total * ANNUAL_PCT + 50) // 100 if s.billing == "annual" else total


def plan_id(s: Sub) -> int:
    return {STARTER: 2 if s.risen else 1, GROWTH: 3, SCALE: 4, ENTERPRISE: 5}[s.tier]


def _custom(rng: np.random.Generator, currency: str) -> int:
    floor, scale, shape, cap = ENTERPRISE_EUR
    eur = min(cap, floor + rng.gamma(shape, scale))
    return int(round(eur * ENTERPRISE_LOCAL[currency] / 50) * 50) * 100


def _state(rng: np.random.Generator, seg: int, currency: str, legacy: bool) -> dict:
    tier = int(pick_index(rng, (TIER_MIX if legacy else NEW_TIER_MIX)[seg], 1)[0])
    billing = "annual" if rng.random() < ANNUAL_SHARE[tier] else "monthly"
    addon = legacy and rng.random() < LEGACY_ADDON[tier]
    extra = 0
    spans = (LEGACY_EXTRA if legacy else NEW_EXTRA).get(tier)
    custom = _custom(rng, currency) if tier == ENTERPRISE else 0
    if spans and tier == SCALE:
        extra = int(round(PRICE_BOOK[currency]["scale"] * rng.uniform(*spans))) * 100
    return {"tier": tier, "billing": billing, "addon": addon, "extra": extra, "custom": custom}


def _event(s: Sub, day: dt.date, kind: str, new_mrr: int, sec: int) -> None:
    delta = new_mrr - s.mrr
    if delta == 0:
        return
    s.events.append((day, kind, delta, sec))
    s.mrr = new_mrr


def _renewal(s: Sub, m: int) -> tuple[dt.date | None, int]:
    months = (MONTH_STARTS[m].year - s.start.year) * 12 + (MONTH_STARTS[m].month - s.start.month)
    step = 1 if s.billing == "monthly" else 12
    if months < step or months % step:
        return None, 0
    return add_months(s.start, months), months // step


def _quota(rng: np.random.Generator, weights: list[float], carry: dict, key) -> np.ndarray:
    """Indices chosen with low variance: as many as the weights sum to, the fraction carried to the next month (systematic
    rounding, so a quota's running count stays within one of its running expectation), each chosen in proportion to its weight."""
    w = np.asarray(weights, dtype=float)
    total = carry.get(key, 0.5) + (float(w.sum()) if len(w) else 0.0)
    k = min(len(w), int(np.floor(total)))
    carry[key] = total - k
    if k == 0:
        return np.array([], dtype=int)
    return rng.choice(len(w), size=k, replace=False, p=w / w.sum())


class Simulation:
    """S8-02's monthly loop: every subscription's events, invoices and add-on spans."""

    def __init__(self, rng: np.random.Generator, acc: dict, fx: dict):
        self.rng, self.acc, self.fx = rng, acc, fx
        self.accounts: list[Account] = []
        self.subs: list[Sub] = []
        self.react: dict[int, list] = {m: [] for m in range(24)}
        self.trial: dict[int, list] = {m: [] for m in range(24)}
        self.carry: dict = {}                       # each quota's fraction carried to the next month

    # -- set-up ---------------------------------------------------------------------------------------------------------------
    def legacy(self) -> int:
        """Legacy candidates in pool order until their MRR on 2024-01-01 reaches the opening target (E-015)."""
        a, total = self.acc, 0.0
        for i in range(a["n_legacy_pool"]):
            seg, country = int(a["segment"][i]), a["country"][i]
            currency = CURRENCY_OF.get(country, "EUR")
            created = EPOCH + dt.timedelta(int(a["created"][i]) // 86400)
            st = _state(self.rng, seg, currency, legacy=True)
            account = Account(seg, currency, created, legacy=True, adopter=st["addon"])
            s = Sub(len(self.accounts), st["tier"], st["billing"], currency, created, "opening", addon=st["addon"],
                    extra=st["extra"], custom=st["custom"])
            if s.addon:
                s.addon_from = created
            _event(s, WINDOW_START, "opening", mrr_of(s), 0)
            account.subs.append(s)
            self.accounts.append(account)
            self.subs.append(s)
            total += s.mrr / 100 * self.fx[currency][0]
            if total >= OPENING_TARGET_EUR:
                return i + 1
        raise ValueError("the legacy pool is too small for the opening target")

    def start_sub(self, account: int, day: dt.date, kind: str, st: dict, sec: int) -> Sub:
        acc = self.accounts[account]
        s = Sub(account, st["tier"], st["billing"], acc.currency, day, kind, risen=day >= PRICE_RISE, addon=st["addon"],
                extra=st["extra"], custom=st["custom"])
        if s.addon:
            s.addon_from = day
        _event(s, day, kind, mrr_of(s), sec)
        s.invoices.append((day, "start", False, None))
        acc.subs.append(s)
        self.subs.append(s)
        return s

    # -- the loop -------------------------------------------------------------------------------------------------------------
    def run(self, kept_legacy: int) -> None:
        a, rng = self.acc, self.rng
        pool = a["n_legacy_pool"]
        self.new_index = {}
        for i in range(pool, len(a["segment"])):
            self.new_index.setdefault(int(a["month"][i]), []).append(i)
        self.candidate = {}                         # final account index -> candidate index
        for k in range(kept_legacy):
            self.candidate[k] = k
        plant_month = 14
        for m in range(24):
            ms, me = MONTH_STARTS[m], MONTH_ENDS[m]
            active = [s for s in self.subs if s.end is None and s.dunning is None and s.start < ms]
            churned_now, contracted = set(), set()
            # 1. renewals: voluntary churn (quotas by segment and billing), the Starter rise, contraction, invoice, payment
            renewals, renewed_on = [], {}
            for s in active:
                r, k = _renewal(s, m)
                if r is None:
                    continue
                renewed_on[id(s)] = r
                if r > WINDOW_START:
                    renewals.append((s, r, k))
                else:
                    s.invoices.append((r, "renewal", False, None))   # a renewal on 2024-01-01: its invoice only
            groups: dict = {}                    # one quota per segment and billing a month, each renewal weighted by its hazard
            for item in renewals:
                s, r, k = item
                groups.setdefault((self.accounts[s.account].segment, s.billing), []).append(item)
            for key in sorted(groups):
                items = groups[key]
                for j in _quota(rng, [self.churn_hazard(s, r, k, m) for s, r, k in items], self.carry, ("churn", key)):
                    s, r, _ = items[j]
                    self.end(s, r, "voluntary")
                    churned_now.add(id(s))
            if m == plant_month:                     # PLANTS["march_2025_exits"]: the largest Enterprise contracts renewing now
                ent = sorted([(s.mrr, i) for i, (s, r, k) in enumerate(renewals)
                              if s.tier == ENTERPRISE and self.accounts[s.account].segment == ENT and id(s) not in churned_now],
                             reverse=True)
                for _, i in ent[:PLANTS["march_2025_exits"]["accounts"]]:
                    s, r, _ = renewals[i]
                    self.end(s, r, "voluntary")
                    churned_now.add(id(s))
            staying = [(s, r, k) for s, r, k in renewals if id(s) not in churned_now]
            for s, r, k in staying:
                if s.tier == STARTER and not s.risen and r >= PRICE_RISE:
                    s.risen = True
                    _event(s, r, "expansion", mrr_of(s), 6 * 3600 + int(rng.integers(0, 3600)))
            can = [(s, r) for s, r, k in staying if self.contraction_options(s)]
            for j in _quota(rng, [CONTRACTION_MONTHLY if s.billing == "monthly" else CONTRACTION_ANNUAL for s, r in can],
                            self.carry, "contraction"):
                s, r = can[j]
                self.contract(s, r)
                contracted.add(id(s))
            invoiced = [(s, r) for s, r, k in staying]
            renewal_no = {id(s): k for s, r, k in staying}
            # An annual plan churns only on a renewal (E-104), so its failed payments never end it: only monthly plans fail fully.
            # One quota per segment a month, as for voluntary churn.
            failing = set()
            for seg in range(3):
                idx = [j for j, (s, r) in enumerate(invoiced) if self.accounts[s.account].segment == seg]
                fail_w = [INVOICE_FAIL * FULL_FAIL[seg] * (EARLY_CHURN if renewal_no[id(invoiced[j][0])] <= 3 else 1.0)
                          if invoiced[j][0].billing == "monthly" and invoiced[j][1] + dt.timedelta(DUNNING_DAYS) <= WINDOW_END else 0.0
                          for j in idx]
                failing |= {idx[int(j)] for j in _quota(rng, fail_w, self.carry, ("fail", seg))}
            for j, (s, r) in enumerate(invoiced):
                full = j in failing
                s.invoices.append((r, "renewal", full, None))
                if full:
                    s.dunning = r + dt.timedelta(DUNNING_DAYS)
            # 2. involuntary churn due this month
            for s in self.subs:
                if s.end is None and s.dunning is not None and ms <= s.dunning <= me:
                    self.end(s, s.dunning, "involuntary")
            # 3. expansions inside the month, and the AP trial purchases due
            pool_exp = [s for s in active if s.end is None and s.dunning is None and id(s) not in churned_now
                        and id(s) not in contracted and self.may_expand(s, ms)]
            weights = [EXPANSION * (ADOPTER_EXPANSION if self.accounts[s.account].adopter else 1.0) for s in pool_exp]
            for j in _quota(rng, weights, self.carry, "expansion"):
                s = pool_exp[j]
                # After the window's first day and after this month's renewal, so the events stay in the order they happened.
                first = max(ms, s.start + dt.timedelta(1), WINDOW_START + dt.timedelta(1))
                if id(s) in renewed_on:
                    first = max(first, renewed_on[id(s)] + dt.timedelta(1))
                if first > me:
                    continue
                day = first + dt.timedelta(int(rng.integers(0, (me - first).days + 1)))
                self.expand(s, day)
            for s, day in self.trial[m]:
                if s.end is None and s.dunning is None and not s.addon and rng.random() < TRIAL_BUY:
                    if id(s) in renewed_on and day <= renewed_on[id(s)]:
                        day = renewed_on[id(s)] + dt.timedelta(1)
                    if day <= me:
                        self.add_addon(s, day)
            # 4. starts: the accounts won this month, then the accounts coming back
            for cand in self.new_index.get(m, []):
                self.start_new(cand)
            for account, prev, day in self.react[m]:
                self.start_reactivation(account, prev, day)

    def churn_hazard(self, s: Sub, r: dt.date, k: int, m: int) -> float:
        acc = self.accounts[s.account]
        if s.billing == "monthly":                 # 05's segment rates, made per plan (TIER_CHURN), with failed payments the rest
            h = BASE_CHURN[acc.segment] * VOLUNTARY_SHARE * TIER_CHURN[s.tier]
            if k <= 3:
                h *= EARLY_CHURN
        else:                                       # 05: 12% at an annual renewal, whatever the plan (annual plans never fail fully)
            h = ANNUAL_RENEWAL_CHURN
        if s.tier == STARTER:
            h *= STARTER_SPIKE.get(m, 1.0)
        if acc.early and k > 3:                     # a monthly plan after onboarding (an annual renewal stays at 12%)
            h *= ADOPTER_CHURN
        return h

    def may_expand(self, s: Sub, ms: dt.date) -> bool:
        acc = self.accounts[s.account]
        if not acc.legacy and not acc.adopter and (ms - acc.created).days < 100:
            return False                            # a non-adopter never touches AP in its first 90 days (FIND-02-10)
        return True

    def end(self, s: Sub, day: dt.date, kind: str) -> None:
        sec = 6 * 3600 + int(self.rng.integers(0, 3600))
        _event(s, day, "churn", 0, sec)
        s.end, s.end_kind, s.dunning = day, kind, None
        if s.addon:
            s.addon_spans.append((s.addon_from, day))
        gap = REACTIVATION_GAP[kind]
        if self.rng.random() < REACTIVATION[kind]:
            back = day + dt.timedelta(int(self.rng.integers(gap[0], gap[1] + 1)))
            if back < WINDOW_END and month_of(back) > month_of(day):
                self.react[month_of(back)].append((s.account, s, back))

    def add_addon(self, s: Sub, day: dt.date) -> None:
        s.addon, s.addon_from = True, day
        self._move(s, day, "expansion")

    def _move(self, s: Sub, day: dt.date, kind: str) -> None:
        old = s.mrr
        sec = 8 * 3600 + int(self.rng.integers(0, 11 * 3600))
        _event(s, day, kind, mrr_of(s), sec)
        if s.billing == "annual" and kind == "expansion" and s.mrr > old:
            s.invoices.append((day, "prorated", False, s.mrr - old))

    def expand(self, s: Sub, day: dt.date) -> None:
        rng = self.rng
        acc = self.accounts[s.account]
        addon_ok = acc.legacy or acc.adopter or (day - acc.created).days >= 97
        if not s.addon and addon_ok and rng.random() < ADDON_FIRST[s.tier]:
            self.add_addon(s, day)
            return
        grow = ADOPTER_SEATS if acc.early else 1.0        # an early AP Automation user runs more invoices through more seats
        before = base_cents(s) + s.extra                  # a month before the annual discount and the add-on
        if s.tier == STARTER:
            s.tier = GROWTH
        elif s.tier == GROWTH:
            if rng.random() < UPGRADE["growth_to_scale"]:
                s.tier, s.extra = SCALE, 0
            else:
                s.extra += int(round(PRICE_BOOK[s.currency]["growth"] * rng.uniform(*SEAT_GROWTH["growth"]) * grow)) * 100
        elif s.tier == SCALE:
            if rng.random() < UPGRADE["scale_to_enterprise"]:
                s.tier, s.extra = ENTERPRISE, 0
                s.custom = _custom(rng, s.currency)
            else:
                s.extra += int(round(PRICE_BOOK[s.currency]["scale"] * rng.uniform(*SEAT_GROWTH["scale"]) * grow)) * 100
        else:
            s.custom = int(round(s.custom * (1 + rng.uniform(*SEAT_GROWTH["enterprise"]) * grow) / 5000) * 5000)
        if base_cents(s) + s.extra <= before:            # an upgrade from a plan carrying many seats keeps them, and then some
            if s.tier == ENTERPRISE:
                s.custom = int(round(before * UPGRADE_FLOOR / 5000) * 5000)
            else:
                s.extra = int(round((before * UPGRADE_FLOOR - base_cents(s)) / 100)) * 100
        self._move(s, day, "expansion")

    def contraction_options(self, s: Sub) -> list:
        """The ways a subscription can contract: drop the add-on, move down a plan (never below its segment's entry plan), cut seats."""
        options = []
        if s.addon and not self.accounts[s.account].early:       # an early AP Automation user keeps the add-on it uses
            options.append(("addon", CONTRACTION_MIX["addon"]))
        if s.tier in (GROWTH, SCALE) and s.tier > MIN_TIER[self.accounts[s.account].segment]:
            options.append(("down", CONTRACTION_MIX["down"]))
        if s.extra or s.tier == ENTERPRISE:
            options.append(("seats", CONTRACTION_MIX["seats"]))
        return options

    def contract(self, s: Sub, day: dt.date) -> None:
        rng = self.rng
        options = self.contraction_options(s)
        what = options[int(pick(rng, options, 1)[0])][0]
        if what == "addon":
            s.addon_spans.append((s.addon_from, day))
            s.addon, s.addon_from = False, None
        elif what == "down":
            s.tier, s.extra = s.tier - 1, 0
            if s.tier == STARTER:
                s.risen = day >= PRICE_RISE
        elif s.tier == ENTERPRISE and not s.extra:
            floor = int(round(ENTERPRISE_EUR[0] * ENTERPRISE_LOCAL[s.currency] / 50) * 50) * 100   # 05: 5,000 EUR, in its currency
            s.custom = min(s.custom, max(floor, int(round(s.custom * (1 - rng.uniform(*SEAT_CUT)) / 5000) * 5000)))
        else:
            s.extra = int(round(s.extra * (1 - rng.uniform(*SEAT_CUT)) / 100)) * 100
        sec = 6 * 3600 + int(rng.integers(0, 3600))
        _event(s, day, "contraction", mrr_of(s), sec)

    def start_new(self, cand: int) -> None:
        a, rng = self.acc, self.rng
        seg, country = int(a["segment"][cand]), a["country"][cand]
        currency = CURRENCY_OF.get(country, "EUR")
        created_sec = int(a["created"][cand])
        day = EPOCH + dt.timedelta(created_sec // 86400)
        acc = Account(seg, currency, day, legacy=False, adopter=bool(rng.random() < ADOPTER_SHARE[seg]))
        acc.early = acc.adopter
        self.candidate[len(self.accounts)] = cand
        self.accounts.append(acc)
        st = _state(rng, seg, currency, legacy=False)
        sec = min(created_sec % 86400 + int(rng.integers(120, 5400)), 86399)
        s = self.start_sub(len(self.accounts) - 1, day, "new", st, sec)
        if acc.adopter:
            buy = day + dt.timedelta(int(rng.integers(70, 96)))
            if buy <= WINDOW_END:
                self.trial[month_of(buy)].append((s, buy))

    def start_reactivation(self, account: int, prev: Sub, day: dt.date) -> None:
        rng = self.rng
        acc = self.accounts[account]
        if any(s.end is None for s in acc.subs):
            return
        tier = prev.tier if (prev.tier <= MIN_TIER[acc.segment] or rng.random() < 0.7) else prev.tier - 1
        addon_ok = acc.legacy or acc.adopter or (day - acc.created).days >= 97
        st = {"tier": tier, "billing": "annual" if rng.random() < 0.15 else "monthly",
              "addon": bool(prev.addon and addon_ok and rng.random() < 0.5), "extra": 0,
              "custom": int(round(prev.custom * 0.9 / 5000) * 5000) if tier == ENTERPRISE else 0}
        if tier == ENTERPRISE and st["custom"] < 500000:
            st["custom"] = _custom(rng, acc.currency)
        self.start_sub(account, day, "reactivation", st, 8 * 3600 + int(rng.integers(0, 10 * 3600)))


def simulate(rng: np.random.Generator, acc: dict, fx: dict) -> Simulation:
    sim = Simulation(rng, acc, fx)
    kept = sim.legacy()
    sim.run(kept)
    for s in sim.subs:                               # the add-on spans still open at as_of_date
        if s.addon and s.end is None:
            s.addon_spans.append((s.addon_from, AS_OF))
    return sim


# ---- the tables the simulation fixes -----------------------------------------------------------------------------------------

def mrr_between(s: Sub, day: dt.date) -> int:
    """The MRR in force on `day` (S8-02): the sum of the subscription's deltas up to and including that day."""
    return sum(delta for d, _, delta, _ in s.events if d <= day)


def build_core(sim: Simulation, acc: dict) -> dict:
    """accounts, subscriptions and subscription_events (clean), with each account's and subscription's final IDs."""
    order = sorted(range(len(sim.accounts)), key=lambda k: (int(acc["created"][sim.candidate[k]]), k))
    account_id = {k: i + 1 for i, k in enumerate(order)}
    rows = []
    for k in order:
        c = sim.candidate[k]
        rows.append((account_id[k], acc["name"][c], acc["country"][c], SEGMENTS[sim.accounts[k].segment], acc["band"][c],
                     acc["industry"][c], acc["channel"][c], int(acc["created"][c])))
    accounts = pa.table({
        "account_id": pa.array([r[0] for r in rows], pa.int32()), "account_name": pa.array([r[1] for r in rows], pa.string()),
        "country_code": pa.array([r[2] for r in rows], pa.string()), "segment": pa.array([r[3] for r in rows], pa.string()),
        "employee_band": pa.array([r[4] for r in rows], pa.string()), "industry": pa.array([r[5] for r in rows], pa.string()),
        "acquisition_channel": pa.array([r[6] for r in rows], pa.string()), "created_at": local_ts([r[7] for r in rows]),
        "is_test": pa.array([False] * len(rows), pa.bool_()),
    })
    subs = sorted(sim.subs, key=lambda s: (s.start, account_id[s.account], s.kind))
    sub_id = {id(s): i + 1 for i, s in enumerate(subs)}
    subscriptions = pa.table({
        "subscription_id": pa.array([sub_id[id(s)] for s in subs], pa.int32()),
        "account_id": pa.array([account_id[s.account] for s in subs], pa.int32()),
        "plan_id": pa.array([plan_id(s) for s in subs], pa.int32()),
        "billing_period": pa.array([s.billing for s in subs], pa.string()),
        "currency": pa.array([s.currency for s in subs], pa.string()),
        "start_date": date_array([s.start for s in subs]),
        "end_date": date_array([s.end for s in subs]),
        "mrr_local": decimal_array([s.mrr if s.end is None else mrr_between(s, s.end - dt.timedelta(1)) for s in subs], 12, 2),
    })
    kinds = {"opening": 0, "new": 0, "reactivation": 0, "expansion": 1, "contraction": 2, "churn": 3}
    ev = []
    for s in subs:
        for day, kind, delta, sec in s.events:
            ev.append((day, kinds[kind], sub_id[id(s)], sec, kind, delta, account_id[s.account]))
    ev.sort()
    events = pa.table({
        "event_id": pa.array(np.arange(1, len(ev) + 1), pa.int64()),
        "subscription_id": pa.array([e[2] for e in ev], pa.int32()),
        "account_id": pa.array([e[6] for e in ev], pa.int32()),
        "event_type": pa.array([e[4] for e in ev], pa.string()),
        "event_date": date_array([e[0] for e in ev]),
        "mrr_delta_local": decimal_array([e[5] for e in ev], 12, 2),
        "recorded_at": local_ts([seconds(e[0]) + e[3] for e in ev]),
    })
    return {"accounts": accounts, "subscriptions": subscriptions, "subscription_events": events, "account_id": account_id,
            "sub_id": sub_id, "subs": subs, "order": order}


def build_invoices_and_payments(rng: np.random.Generator, core: dict) -> dict:
    """Each invoice's amount from the events (a monthly plan bills its MRR in force, an annual one twelve months of it, a mid-term
    annual expansion its prorated rest of the year), and its payment attempts as UTC instants (05: 4% fail, 3 retries)."""
    sub_id, account_id = core["sub_id"], core["account_id"]
    inv = []
    for s in core["subs"]:
        for day, kind, full, prorated in s.invoices:
            if kind == "prorated":
                anniversary = s.start
                while anniversary <= day:
                    anniversary = add_months(anniversary, 12)
                previous = add_months(anniversary, -12)
                cents = int(round(prorated * 12 * (anniversary - day).days / (anniversary - previous).days))
            else:
                cents = mrr_between(s, day) * (12 if s.billing == "annual" else 1)
            inv.append((day, sub_id[id(s)], kind, cents, full, account_id[s.account], s.currency))
    inv.sort(key=lambda r: (r[0], r[1], r[2]))
    rest = INVOICE_FAIL * 0.9                            # first-attempt failures among the invoices that are paid in the end
    reasons = (("insufficient_funds", 0.35), ("card_expired", 0.25), ("card_declined", 0.25), ("authentication_required", 0.10),
               ("bank_rejected", 0.05))
    pay, status = [], []
    end_utc = seconds(AS_OF) - 3600
    for i, (day, _, _, _, full, _, _) in enumerate(inv):
        if full:
            outcome = [False, False, False, False]
        elif rng.random() < rest:
            fails = 1 + int(rng.random() < 0.45) + int(rng.random() < 0.2)
            outcome = [False] * fails + [True]
        else:
            outcome = [True]
        local_first = seconds(day) + int(rng.integers(3 * 3600, 7 * 3600))
        times = [int(local_to_utc_safe(np.array([local_first]))[0])]
        for k in range(1, len(outcome)):
            times.append(seconds(day + dt.timedelta(RETRY_DAYS[k])) + int(rng.integers(6 * 3600, 24 * 3600)))
        paid = False
        for k, (ok, t) in enumerate(zip(outcome, times)):
            if t >= end_utc:
                break
            reason = None if ok else reasons[int(pick(rng, reasons, 1)[0])][0]
            pay.append((t, i + 1, k + 1, ok, reason))
            paid = paid or ok
        status.append("paid" if paid else ("uncollectible" if full else "open"))
    invoices = pa.table({
        "invoice_id": pa.array(np.arange(1, len(inv) + 1), pa.int64()),
        "account_id": pa.array([r[5] for r in inv], pa.int32()),
        "subscription_id": pa.array([r[1] for r in inv], pa.int32()),
        "invoice_date": date_array([r[0] for r in inv]),
        "amount_local": decimal_array([r[3] for r in inv], 12, 2),
        "currency": pa.array([r[6] for r in inv], pa.string()),
        "status": pa.array(status, pa.string()),
    })
    pay.sort(key=lambda r: (r[0], r[1], r[2]))
    utc = np.array([p[0] for p in pay], dtype=np.int64)
    local = utc + brussels_offset(utc)
    payments = pa.table({
        "payment_id": pa.array(np.arange(1, len(pay) + 1), pa.int64()),
        "invoice_id": pa.array([p[1] for p in pay], pa.int64()),
        "attempt_no": pa.array([p[2] for p in pay], pa.int32()),
        "attempted_at": local_ts(local),
        "succeeded": pa.array([p[3] for p in pay], pa.bool_()),
        "failure_reason": pa.array([p[4] for p in pay], pa.string()),
    })
    return {"invoices": invoices, "payments": payments, "payments_utc": utc}


def active_spans(acc: Account) -> list[tuple[dt.date, dt.date]]:
    """An account's [start, end) spans with a subscription, end as_of_date while it runs."""
    return [(max(s.start, dt.date(2000, 1, 1)), s.end or AS_OF) for s in sorted(acc.subs, key=lambda s: s.start)]


def build_users(rng: np.random.Generator, sim: Simulation, core: dict, acc: dict) -> dict:
    """Users of each account: the first ones at each start, more over time, turnover with replacement, all deactivated at a churn."""
    account_id = core["account_id"]
    rows = []                                          # (invited seconds, account index, role, deactivated seconds or None)
    for k in core["order"]:
        a = sim.accounts[k]
        created_sec = int(acc["created"][sim.candidate[k]])
        for n, (start, end) in enumerate(active_spans(a)):
            tier = next(s.tier for s in a.subs if s.start == start)
            low, high = SEATS.get((a.segment, tier), (3, 8))
            first = int(rng.integers(low, high + 1))
            t0 = created_sec + int(rng.integers(300, 3600)) if n == 0 else seconds(start) + int(rng.integers(8 * 3600, 18 * 3600))
            end_sec = seconds(end) + 9 * 3600 + int(rng.integers(0, 3600)) if end < AS_OF else None
            span_days = (end - start).days
            months = max(span_days / 30.4, 0.1)
            invites = [t0] + [t0 + int(rng.integers(0, 14 * 86400)) for _ in range(first - 1)]
            extra = rng.poisson(USER_GROWTH[a.segment] * months)
            invites += [t0 + int(rng.integers(14 * 86400, max(14 * 86400 + 1, span_days * 86400))) for _ in range(extra)]
            queue = sorted(invites)
            j = 0
            while j < len(queue):
                inv = queue[j]
                role = "admin" if j == 0 else ROLES[int(pick(rng, ROLES, 1)[0])][0]
                leave = inv + int(rng.exponential(USER_TENURE_MONTHS * 30.4 * 86400))
                if end_sec is not None and leave >= end_sec:
                    leave = end_sec
                elif end_sec is None and leave >= seconds(AS_OF):
                    leave = None
                elif rng.random() < USER_REPLACE:
                    queue.append(leave + int(rng.integers(86400, 30 * 86400)))
                if end_sec is not None and inv >= end_sec:
                    j += 1
                    continue
                if inv >= seconds(AS_OF):
                    j += 1
                    continue
                rows.append((inv, k, role, leave))
                j += 1
    rows.sort(key=lambda r: (r[0], account_id[r[1]], r[2]))
    table = pa.table({
        "user_id": pa.array(np.arange(1, len(rows) + 1), pa.int64()),
        "account_id": pa.array([account_id[r[1]] for r in rows], pa.int32()),
        "role": pa.array([r[2] for r in rows], pa.string()),
        "invited_at": local_ts([r[0] for r in rows]),
        "deactivated_at": local_ts([r[3] for r in rows]),
    })
    by_account: dict = {}
    for uid, r in enumerate(rows, start=1):
        by_account.setdefault(r[1], []).append((uid, r[0], r[3]))
    return {"table": table, "by_account": by_account}


def _seats_at(users: list, t: int) -> list:
    return [u for u in users if u[1] <= t and (u[2] is None or u[2] > t)]


def build_usage(rng: np.random.Generator, sim: Simulation, core: dict, users: dict) -> dict:
    """One row per account and week it is active: active users from its seats and engagement, decaying over the 8 weeks before a
    voluntary churn (FIND-02-09), reconciliations by plan, and AP module events while AP Automation is in use (FIND-02-10)."""
    account_id = core["account_id"]
    decay = PLANTS["usage_decay"]
    rows, weekly = [], {}
    for k in core["order"]:
        a = sim.accounts[k]
        p = rng.beta(*ENGAGEMENT)
        seats = users["by_account"].get(k, [])
        ap_spans = [span for s in a.subs for span in s.addon_spans]
        churns = [s.end for s in a.subs if s.end is not None and s.end_kind == "voluntary"]
        dips = {}                                    # temporary dips in healthy use: FIND-02-09's signal is not a sure thing
        for q in range(8):
            if rng.random() < USAGE_DIPS[0]:
                first = 13 * q + int(rng.integers(0, 13))
                level = rng.uniform(*USAGE_DIPS[2])
                for wk in range(first, min(first + int(rng.integers(USAGE_DIPS[1][0], USAGE_DIPS[1][1] + 1)), len(WEEK_STARTS))):
                    dips[WEEK_STARTS[wk]] = level
        for w in WEEK_STARTS:
            week_end = w + dt.timedelta(6)
            live = [s for s in a.subs if s.start <= week_end and (s.end is None or s.end > w)]
            if not live:
                continue
            s = max(live, key=lambda x: x.start)
            n_seats = len(_seats_at(seats, seconds(w) + 12 * 3600)) or 1
            factor = p * float(np.exp(rng.normal(0, 0.10)))
            factor *= HOLIDAY_WEEKS.get(w.isoformat(), 1.0) * (SUMMER_FACTOR if w.month == 8 else 1.0) * dips.get(w, 1.0)
            for c in churns:
                lead = (c - w).days
                if 0 < lead <= 7 * decay["weeks_before_voluntary_churn"]:
                    factor *= decay["to_share"] + (1 - decay["to_share"]) * (lead - 1) / (7 * decay["weeks_before_voluntary_churn"])
            active = max(1, int(round(n_seats * min(factor, 0.98))))
            recon = int(rng.poisson(active * RECON_RATE[s.tier]))
            if a.adopter and not a.legacy and w < a.created + dt.timedelta(90) and week_end >= a.created:
                ap = max(1, int(rng.poisson(active * AP_RATE)))
            elif any(f is not None and f <= w and w < t for f, t in ap_spans):
                ap = max(1, int(rng.poisson(active * AP_RATE)))
            else:
                ap = 0
            rows.append((account_id[k], w, active, recon, ap))
            weekly[(k, w)] = active
    rows.sort(key=lambda r: (r[0], r[1]))
    table = pa.table({
        "account_id": pa.array([r[0] for r in rows], pa.int32()), "week_start": date_array([r[1] for r in rows]),
        "active_users": pa.array([r[2] for r in rows], pa.int32()), "reconciliations_run": pa.array([r[3] for r in rows], pa.int32()),
        "ap_module_events": pa.array([r[4] for r in rows], pa.int32()),
    })
    return {"table": table, "weekly": weekly}


def build_tickets(rng: np.random.Generator, sim: Simulation, core: dict) -> pa.Table:
    """Tickets per active account-month, P1 bursts before a voluntary churn and in rare incident quarters, slow P1s in Q3 2025."""
    account_id = core["account_id"]
    rows = []

    def opened(day_from: dt.date, day_to: dt.date) -> int | None:
        span = (day_to - day_from).days
        if span <= 0:
            return None
        day = day_from + dt.timedelta(int(rng.integers(0, span)))
        if day.weekday() >= 5 and rng.random() < 0.7:
            day -= dt.timedelta(day.weekday() - 4)
            if day < day_from:
                day = day_from
        return seconds(day) + int(rng.integers(7 * 3600, 19 * 3600))

    for k in core["order"]:
        a = sim.accounts[k]
        spans = [(max(st, WINDOW_START), min(en, AS_OF)) for st, en in active_spans(a) if en > WINDOW_START]
        for st, en in spans:
            for m in range(24):
                lo, hi = max(st, MONTH_STARTS[m]), min(en, MONTH_ENDS[m] + dt.timedelta(1))
                if hi <= lo:
                    continue
                n = rng.poisson(TICKET_RATE[a.segment] * (hi - lo).days / 30.4)
                for _ in range(n):
                    t = opened(lo, hi)
                    if t is not None:
                        rows.append([t, k, None, None])
            for q in range(8):
                q_lo, q_hi = max(st, MONTH_STARTS[3 * q]), min(en, MONTH_ENDS[3 * q + 2] + dt.timedelta(1))
                if q_hi > q_lo and rng.random() < P1_STORMS[0]:
                    for _ in range(rng.poisson(P1_STORMS[1])):
                        t = opened(q_lo, q_hi)
                        if t is not None:
                            rows.append([t, k, "P1", None])
        for s in a.subs:
            if s.end is not None and s.end_kind == "voluntary":
                lo = max(s.start, s.end - dt.timedelta(CHURN_P1[1]), WINDOW_START)
                hi = s.end - dt.timedelta(CHURN_P1[2])
                for _ in range(rng.poisson(CHURN_P1[0])):
                    t = opened(lo, hi)
                    if t is not None:
                        rows.append([t, k, "P1", None])
    rows.sort(key=lambda r: (r[0], account_id[r[1]]))
    backlog_from, backlog_to = seconds(dt.date(2025, 7, 1)), seconds(dt.date(2025, 10, 1))
    out = []
    for t, k, prio, _ in rows:
        prio = prio or PRIORITIES[int(pick(rng, PRIORITIES, 1)[0])][0]
        category = CATEGORIES[int(pick(rng, CATEGORIES, 1)[0])][0]
        median, sigma = RESOLUTION_HOURS[prio]
        hours = median * float(np.exp(rng.normal(0, sigma)))
        if prio == "P1" and backlog_from <= t < backlog_to:
            hours *= PLANTS["p1_backlog"]["resolution_multiplier"]
        resolved = t + int(round(hours * 3600))
        if resolved >= seconds(AS_OF) or rng.random() < UNRESOLVED:
            resolved = None
        out.append((t, account_id[k], category, prio, resolved))
    return pa.table({
        "ticket_id": pa.array(np.arange(1, len(out) + 1), pa.int64()),
        "account_id": pa.array([r[1] for r in out], pa.int32()),
        "opened_at": local_ts([r[0] for r in out]),
        "category": pa.array([r[2] for r in out], pa.string()),
        "priority": pa.array([r[3] for r in out], pa.string()),
        "resolved_at": local_ts([r[4] for r in out]),
    })


def month_end_mrr_eur(sim: Simulation, fx: dict) -> np.ndarray:
    """Each month's closing MRR in EUR at its month end's rate."""
    out = np.zeros(24)
    for s in sim.subs:
        for m in range(24):
            me = MONTH_ENDS[m]
            if s.start <= me and (s.end is None or s.end > me):
                out[m] += mrr_between(s, me) / 100 * fx[s.currency][(me - WINDOW_START).days]
    return out


def build_cogs(rng: np.random.Generator, revenue: np.ndarray) -> pa.Table:
    """COGS by month and type, about (1 - gross margin) of the month's MRR (S8-05, E-087)."""
    rows = []
    for m in range(24):
        total = revenue[m] * (1 - PLANTS["gross_margin"]) * float(np.exp(rng.normal(0, 0.03)))
        shares = np.array([w for _, w in COGS_TYPES]) * np.exp(rng.normal(0, 0.05, len(COGS_TYPES)))
        shares /= shares.sum()
        for (kind, _), share in zip(COGS_TYPES, shares):
            rows.append((MONTH_STARTS[m], kind, int(round(total * share * 100))))
    return pa.table({"month": date_array([r[0] for r in rows]), "cost_type": pa.array([r[1] for r in rows], pa.string()),
                     "amount_eur": decimal_array([r[2] for r in rows], 12, 2)})


def acquisition(core: dict, fx: dict) -> dict:
    """Per channel: the accounts won in the window and the average EUR MRR of their new events."""
    out = {}
    accounts = core["accounts"]
    channel = dict(zip(accounts.column("account_id").to_pylist(), accounts.column("acquisition_channel").to_pylist()))
    for s in core["subs"]:
        if s.kind != "new":
            continue
        ch = channel[core["account_id"][s.account]]
        eur = s.events[0][2] / 100 * fx[s.currency][(s.start - WINDOW_START).days]
        n, total = out.get(ch, (0, 0.0))
        out[ch] = (n + 1, total + eur)
    return {ch: {"logos": n, "new_mrr": total / n} for ch, (n, total) in out.items()}


def gross_margin(cogs: pa.Table, revenue: np.ndarray) -> float:
    return 1 - sum(v / 100 for v in _decimal_cents(cogs.column("amount_eur"))) / float(revenue.sum())


def _decimal_cents(column) -> list[int]:
    return [int(round(float(v) * 100)) for v in column.to_pylist()]


def _spread(rng: np.random.Generator, total: float, n: int, growth: float = 0.2, sigma: float = 0.08) -> list[int]:
    """A channel's total over the 24 months: rising with the business, seasonal, with noise; in cents, summing to the total."""
    w = np.array([(1 + growth * m / 23) * NEW_SEASON[m % 12] for m in range(n)]) * np.exp(rng.normal(0, sigma, n))
    cents = np.floor(w / w.sum() * total * 100).astype(np.int64)
    cents[-1] += int(round(total * 100)) - int(cents.sum())
    return cents.tolist()


def build_sm_expense(rng: np.random.Generator, acq: dict, gm: float) -> tuple[pa.Table, dict]:
    """Salaries, tools and partner fees by month and channel (S8-05). The partner fees make partner CAC payback about 7 months."""
    totals = {}
    for (ch, kind), monthly in SM_FIXED.items():
        totals[(ch, kind)] = sum(monthly * (1 + 0.2 * m / 23) for m in range(24))
    p = acq["partner"]
    target = PLANTS["payback_months"]["partner"] * gm * p["new_mrr"] * p["logos"]
    totals[("partner", "partner_fees")] = target - totals[("partner", "salaries")]
    rows = []
    for (ch, kind), total in sorted(totals.items()):
        for m, cents in enumerate(_spread(rng, total, 24)):
            rows.append((MONTH_STARTS[m], ch, kind, cents))
    rows.sort(key=lambda r: (r[0], r[1], r[2]))
    table = pa.table({"month": date_array([r[0] for r in rows]), "channel": pa.array([r[1] for r in rows], pa.string()),
                      "cost_type": pa.array([r[2] for r in rows], pa.string()), "amount_eur": decimal_array([r[3] for r in rows], 12, 2)})
    by_channel = {}
    for _, ch, _, cents in rows:
        by_channel[ch] = by_channel.get(ch, 0) + cents
    return table, by_channel


def build_marketing(rng: np.random.Generator, acq: dict, gm: float, sm_by_channel: dict) -> pa.Table:
    """Paid media by month and channel (05 CO-02), each channel's total set by its planted payback (FIND-02-15)."""
    rows = []
    for ch in PAID_MEDIA:
        a = acq.get(ch, {"logos": 1, "new_mrr": 500.0})
        total = PLANTS["payback_months"][ch] * gm * a["new_mrr"] * a["logos"] - sm_by_channel.get(ch, 0) / 100
        for m, cents in enumerate(_spread(rng, total, 24, sigma=0.10)):
            rows.append((MONTH_STARTS[m], ch, cents))
    rows.sort(key=lambda r: (r[0], r[1]))
    return pa.table({"month": date_array([r[0] for r in rows]), "channel": pa.array([r[1] for r in rows], pa.string()),
                     "spend_eur": decimal_array([r[2] for r in rows], 12, 2)})


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower().replace("b.v.", ""))


def build_funnel(rng_leads: np.random.Generator, rng_opps: np.random.Generator, sim: Simulation, core: dict, acc: dict,
                 fx: dict) -> tuple[pa.Table, pa.Table]:
    """S8-05: each account won in the window has its lead and its won opportunity, back-filled before its created_at (closed on or
    before it); lost and open opportunities and leads that never became one fill the funnel. Every lead is in the window."""
    account_id = core["account_id"]
    floor = seconds(WINDOW_START) + 8 * 3600
    end = seconds(AS_OF)
    leads, opps = [], []                               # (created, source, segment, email), (lead index, account, created, stage, closed, won, cents)
    for k in core["order"]:
        a = sim.accounts[k]
        if a.legacy:
            continue
        c = sim.candidate[k]
        created = int(acc["created"][c])
        closed = max(floor, created - int(rng_opps.integers(0, 48 * 3600)))   # created is 08:00 or later, so floor <= closed <= created
        cycle = int(rng_opps.integers(CYCLE_DAYS[a.segment][0] * 86400, CYCLE_DAYS[a.segment][1] * 86400))
        gap = int(rng_leads.integers(12 * 3600, 21 * 86400))
        if closed - cycle - gap < floor:               # the window's first won accounts had shorter cycles in the data
            room = closed - floor
            f = room * rng_opps.uniform(0.55, 0.95) / (cycle + gap)
            cycle, gap = int(cycle * f), int(gap * f)
        opp_created = closed - cycle
        lead_created = opp_created - gap
        first = next(s for s in a.subs if s.kind == "new")
        eur = first.events[0][2] / 100 * fx[first.currency][(first.start - WINDOW_START).days]
        role = EMAIL_ROLES[int(rng_leads.integers(len(EMAIL_ROLES)))]
        leads.append((lead_created, acc["channel"][c], a.segment, f"{role}@{_slug(acc['name'][c])}.example"))
        opps.append((len(leads) - 1, account_id[k], opp_created, "contract", closed, True, int(round(eur * 12 * 100))))
    won_by_month = np.zeros(24)
    for o in opps:
        won_by_month[month_of(EPOCH + dt.timedelta(o[4] // 86400))] += 1
    seg_share = np.array([sum(1 for k in core["order"] if not sim.accounts[k].legacy and sim.accounts[k].segment == s)
                          for s in range(3)], dtype=float)
    seg_share /= seg_share.sum()
    typical = {SMB: 330.0, MM: 1400.0, ENT: 4200.0}
    for m in range(24):
        for seg in range(3):
            won = won_by_month[m] * seg_share[seg]
            lost_or_open = rng_opps.poisson(won * (1 - WIN_RATE[seg]) / WIN_RATE[seg] + (6 * seg_share[seg] if m >= 21 else 0))
            for _ in range(lost_or_open):
                day = _days_in_month(rng_opps, m, 1)[0]
                created = seconds(day) + int(rng_opps.integers(8 * 3600, 18 * 3600))
                cycle = int(rng_opps.integers(CYCLE_DAYS[seg][0] * 86400, CYCLE_DAYS[seg][1] * 86400))
                stage = int(pick(rng_opps, LOST_AT, 1)[0])
                closed = created + int(cycle * rng_opps.uniform(0.3, 1.0))
                lead_created = max(floor, created - int(rng_leads.integers(12 * 3600, 21 * 86400)))
                channel = CHANNELS[int(pick_index(rng_leads, CHANNEL_MIX[seg], 1)[0])]
                name = f"{NAME_PREFIXES[int(rng_leads.integers(len(NAME_PREFIXES)))]} {NAME_STEMS[int(rng_leads.integers(len(NAME_STEMS)))]}"
                role = EMAIL_ROLES[int(rng_leads.integers(len(EMAIL_ROLES)))]
                leads.append((lead_created, channel, seg, f"{role}@{_slug(name)}.example"))
                cents = int(round(typical[seg] * 12 * float(np.exp(rng_opps.normal(0, 0.35))) * 100))
                if closed >= end:
                    opps.append((len(leads) - 1, None, created, STAGES[stage], None, None, cents))
                else:
                    opps.append((len(leads) - 1, None, created, STAGES[stage], closed, False, cents))
    for m in range(24):
        for seg in range(3):
            n_opps = sum(1 for o in opps if month_of(EPOCH + dt.timedelta(leads[o[0]][0] // 86400)) == m and leads[o[0]][2] == seg)
            extra = rng_leads.poisson(n_opps * (1 - OPP_RATE[seg]) / OPP_RATE[seg])
            for day in _days_in_month(rng_leads, m, extra):
                created = seconds(day) + int(rng_leads.integers(6 * 3600, 23 * 3600))
                channel = CHANNELS[int(pick_index(rng_leads, CHANNEL_MIX[seg], 1)[0])]
                name = f"{NAME_PREFIXES[int(rng_leads.integers(len(NAME_PREFIXES)))]} {NAME_STEMS[int(rng_leads.integers(len(NAME_STEMS)))]}"
                role = EMAIL_ROLES[int(rng_leads.integers(len(EMAIL_ROLES)))]
                leads.append((max(created, floor), channel, seg, f"{role}@{_slug(name)}.example"))
    lead_order = sorted(range(len(leads)), key=lambda i: (leads[i][0], i))
    lead_id = {i: n + 1 for n, i in enumerate(lead_order)}
    lead_table = pa.table({
        "lead_id": pa.array([lead_id[i] for i in lead_order], pa.int64()),
        "created_at": local_ts([leads[i][0] for i in lead_order]),
        "source": pa.array([leads[i][1] for i in lead_order], pa.string()),
        "segment": pa.array([SEGMENTS[leads[i][2]] for i in lead_order], pa.string()),
        "email": pa.array([leads[i][3] for i in lead_order], pa.string()),
    })
    opps.sort(key=lambda o: (o[2], lead_id[o[0]]))
    opp_table = pa.table({
        "opportunity_id": pa.array(np.arange(1, len(opps) + 1), pa.int64()),
        "lead_id": pa.array([lead_id[o[0]] for o in opps], pa.int64()),
        "account_id": pa.array([o[1] for o in opps], pa.int32()),
        "created_at": local_ts([o[2] for o in opps]),
        "stage": pa.array([o[3] for o in opps], pa.string()),
        "closed_at": local_ts([o[4] for o in opps]),
        "is_won": pa.array([o[5] for o in opps], pa.bool_()),
        "amount_eur": decimal_array([o[6] for o in opps], 12, 2),
    })
    return lead_table, opp_table


def build_app_events(rng: np.random.Generator, sim: Simulation, core: dict, users: dict, usage: dict) -> tuple[pa.Table, dict]:
    """S8-06: in-app events in UTC, 2025-10-01 to 2025-12-31, of the accounts in the tracking rollout: each week, as many of an
    account's active users as usage_weekly counts, in short sessions on working days. Two plants: one user's session across the
    2025-10-26 clock change, and gaps of 29:59, 30:00 and 30:01 between a user's events (SQL-PAT-08's 30-minute rule)."""
    account_id = core["account_id"]
    first, last = APP_WINDOW
    window_lo, window_hi = seconds(first), seconds(last + dt.timedelta(1))
    events = []                                        # (utc seconds, user, account index, name)
    tracked = [k for k in core["order"] if any(s.start <= last and (s.end is None or s.end > first) for s in sim.accounts[k].subs)]
    per_user_week = (1 + APP_SESSIONS) * (2 + 1 / APP_EVENTS) * 13 / 14   # expected events a week (13 of the weeks fall in the window)
    chosen, expected = [], 0.0
    for k in [tracked[int(i)] for i in rng.permutation(len(tracked))]:
        if expected >= APP_TARGET:
            break
        chosen.append(k)
        expected += per_user_week * sum(usage["weekly"].get((k, w), 0) for w in WEEK_STARTS if w + dt.timedelta(6) >= first)
    tracked = sorted(chosen, key=core["order"].index)
    weeks = [w for w in WEEK_STARTS if w + dt.timedelta(6) >= first]
    for k in tracked:
        a = sim.accounts[k]
        seats = users["by_account"].get(k, [])
        for w in weeks:
            active = usage["weekly"].get((k, w))
            if not active:
                continue
            noon = seconds(w) + 12 * 3600
            pool = _seats_at(seats, noon)
            if not pool:
                continue
            chosen = rng.choice(len(pool), size=min(active, len(pool)), replace=False)
            for j in chosen:
                uid, invited, gone = pool[int(j)]
                n_sessions = 1 + rng.poisson(APP_SESSIONS)
                days = sorted(set(int(d) for d in rng.choice(5, size=min(n_sessions, 5), replace=False)))
                for d in days:
                    day = w + dt.timedelta(d)
                    if not (first <= day <= last):
                        continue
                    if not any(s.start <= day and (s.end is None or s.end > day) for s in a.subs):
                        continue
                    local = seconds(day) + int(rng.integers(8 * 3600, 17 * 3600))
                    utc = int(local_to_utc_safe(np.array([local]))[0])
                    n = 2 + rng.geometric(APP_EVENTS)
                    t = utc
                    names = rng.choice(len(APP_NAMES), size=n, p=_app_weights(a.adopter))
                    for e in range(n):
                        if e:
                            t += int(min(1500, 20 + rng.lognormal(np.log(80), 0.9)))
                        local_t = t + int(brussels_offset(np.array([t]))[0])
                        if local_t < invited or (gone is not None and local_t >= gone):
                            continue
                        events.append((t, uid, k, "login" if e == 0 else APP_NAMES[int(names[e])]))
    plants = _plant_app_events(rng, events, sim, core, users)
    events = [e for e in events if window_lo <= e[0] < window_hi]
    seen, unique = set(), []
    for e in sorted(events):
        if (e[1], e[0]) in seen:
            continue
        seen.add((e[1], e[0]))
        unique.append(e)
    table = pa.table({
        "event_id": pa.array(np.arange(1, len(unique) + 1), pa.int64()),
        "user_id": pa.array([e[1] for e in unique], pa.int64()),
        "account_id": pa.array([account_id[e[2]] for e in unique], pa.int32()),
        "event_ts": utc_ts([e[0] for e in unique]),
        "event_name": pa.array([e[3] for e in unique], pa.string()),
    })
    return table, plants


def _app_weights(adopter: bool) -> np.ndarray:
    w = np.array([0.22, 0.16, 0.20, 0.10, 0.08, 0.08, 0.05, 0.06, 0.05 if adopter else 0.0])
    return w / w.sum()


def _plant_app_events(rng: np.random.Generator, events: list, sim: Simulation, core: dict, users: dict) -> dict:
    """The clock-change session and the near-30-minute gaps, each on a tracked account's user active then, removing that user's
    other events around it so each plant reads as written."""
    account_id = core["account_id"]
    by_user = {}
    for e in events:
        by_user.setdefault(e[1], e[2])

    def candidate(day: dt.date) -> tuple[int, int] | None:
        for uid, k in sorted(by_user.items()):
            seats = users["by_account"].get(k, [])
            u = next((x for x in seats if x[0] == uid), None)
            t = seconds(day) + 12 * 3600
            if u and u[1] <= t - 86400 and (u[2] is None or u[2] > t + 86400) and \
                    any(s.start <= day and (s.end is None or s.end > day + dt.timedelta(1)) for s in sim.accounts[k].subs):
                return uid, k
        return None

    plants = {}
    # One user active across 2025-10-26 01:00 UTC (03:00 CEST becomes 02:00 CET): events 00:20 to 01:40 UTC, 7 to 12 minutes apart.
    change_day = dt.date(2025, 10, 26)
    pick_user = candidate(change_day)
    if pick_user:
        uid, k = pick_user
        lo, hi = seconds(change_day) - 3 * 3600, seconds(change_day) + 5 * 3600
        events[:] = [e for e in events if not (e[1] == uid and lo <= e[0] <= hi)]
        t = seconds(change_day) + 20 * 60
        times = []
        while t <= seconds(change_day) + 100 * 60:
            times.append(t)
            t += int(rng.integers(7 * 60, 12 * 60 + 1))
        for n, t in enumerate(times):
            events.append((t, uid, k, "login" if n == 0 else APP_NAMES[n % 4]))
        plants["clock_change_user"] = {"user_id": uid, "account_id": account_id[k], "first_utc": "2025-10-26T00:20:00+00:00",
                                       "events": len(times)}
    # Gaps of 29:59, 30:00 and 30:01 between two events of one user, each on its own working day.
    gaps = []
    for gap, day in ((1799, dt.date(2025, 11, 4)), (1800, dt.date(2025, 11, 12)), (1801, dt.date(2025, 11, 20))):
        found = candidate(day)
        if not found:
            continue
        uid, k = found
        lo, hi = seconds(day), seconds(day) + 86400
        events[:] = [e for e in events if not (e[1] == uid and lo <= e[0] < hi)]
        start = int(local_to_utc_safe(np.array([seconds(day) + 10 * 3600]))[0])
        session1 = [start, start + 140, start + 410]
        session2 = [session1[-1] + gap, session1[-1] + gap + 95, session1[-1] + gap + 260]
        for n, t in enumerate(session1 + session2):
            events.append((t, uid, k, "login" if n in (0, 3) else APP_NAMES[n]))
        gaps.append(gap)
        by_user.pop(uid, None)
    plants["gaps_seconds"] = gaps
    return plants


# ---- generate ----------------------------------------------------------------------------------------------------------------

def generate(seed: int = SEED) -> tuple[dict, dict]:
    r = rngs(seed)
    fx_table, fx = build_fx(r["fx_rates"])
    acc = draw_accounts(r["accounts"])
    sim = simulate(r["subscriptions_and_events"], acc, fx)
    core = build_core(sim, acc)
    users = build_users(r["users"], sim, core, acc)
    usage = build_usage(r["usage_weekly"], sim, core, users)
    billing = build_invoices_and_payments(r["payments"], core)
    tickets = build_tickets(r["support_tickets"], sim, core)
    revenue = month_end_mrr_eur(sim, fx)
    cogs = build_cogs(r["cogs_monthly"], revenue)
    gm = gross_margin(cogs, revenue)
    acq = acquisition(core, fx)
    sm, sm_by_channel = build_sm_expense(r["sm_expense_monthly"], acq, gm)
    marketing = build_marketing(r["marketing_spend_monthly"], acq, gm, sm_by_channel)
    leads, opportunities = build_funnel(r["leads"], r["opportunities"], sim, core, acc, fx)
    app_events, app_plants = build_app_events(r["app_events"], sim, core, users, usage)
    clean = {
        "accounts": core["accounts"], "plans": build_plans(), "subscriptions": core["subscriptions"],
        "subscription_events": core["subscription_events"], "invoices": billing["invoices"], "payments": billing["payments"],
        "fx_rates": fx_table, "users": users["table"], "usage_weekly": usage["table"], "support_tickets": tickets,
        "marketing_spend_monthly": marketing, "leads": leads, "opportunities": opportunities, "cogs_monthly": cogs,
        "sm_expense_monthly": sm, "app_events": app_events,
    }
    clean = {name: clean[name] for name in CLEAN_TABLES}
    from . import raw as ll_raw                           # raw.py imports this module, so it is imported when generate() runs
    raw, planted_raw = ll_raw.inject_quirks(r["quirks"], clean, billing["payments_utc"])
    opening = sum(s.events[0][2] / 100 * fx[s.currency][0] for s in sim.subs if s.kind == "opening")
    truth = {
        "company": "ledgerloop", "seed": seed, "as_of_date": AS_OF_DATE,
        "definitions": DEFINITIONS,
        "s8_04": S8_04_VOLUMES,
        "planted": {**PLANTS, "opening_mrr_eur": round(opening, 2), "app_events": app_plants,
                    "raw": dict(sorted(planted_raw.items()))},
    }
    return {"clean": clean, "raw": raw}, truth


# ---- validation (GEN-01, GEN-06 as OD-GEN-01 and E-093 amend it) ------------------------------------------------------------

DEFINITIONS = {
    "MRR": "S8-02: a subscription's MRR on a date is the sum of its subscription_events.mrr_delta_local with event_date on or before "
           "that date, in its subscriptions.currency; in EUR, times fx_rates.eur_per_unit of that currency on that date. Movement "
           "queries leave the opening events (all on 2024-01-01) out.",
    "active": "A subscription is active on a date d when start_date <= d and (end_date is missing or end_date > d): end_date is the "
              "day of its churn event, the first day without it.",
    "FIND-02-01": "Subscriptions active on 2025-12-31, by plans.plan_name: Scale plus Enterprise as a share of the count, and of "
                  "sum(mrr_local times the 2025-12-31 rate).",
    "FIND-02-02": "Accounts by country_code (DE has the most); the distinct subscriptions.currency, and the countries billing outside EUR.",
    "FIND-02-03": "MRR in EUR at each month end at that day's rate; Dec 2025 (2025-12-31) over Jan 2024 (2024-01-31).",
    "FIND-02-04": "Churn MRR by event month: minus the sum of churn deltas in EUR at the event day's rate; the month with the most.",
    "FIND-02-05": "Monthly logo churn: subscriptions active on the month's first day that end that month, over those active then; "
                  "SMB (accounts.segment) on Starter (plans.plan_name) and Mid-Market (every plan); the mean of Feb to May 2025 over "
                  "the mean of the 12 months of 2024.",
    "FIND-02-06": "Accounts with MRR on 2025-01-01; their MRR then and on 2025-12-31, both in EUR at the 2025-12-31 rate (so a rate "
                  "change is not retention). GRR = sum(least(end, start)) / sum(start); NRR = sum(end) / sum(start); logo churn = "
                  "the share with no MRR on 2025-12-31; gross revenue churn = 1 - GRR.",
    "FIND-02-07": "New (event_type new) monthly-billed subscriptions starting by 2025-09-30: the share still active 3 months after "
                  "start_date. Annual-billed new subscriptions starting in 2024: the share ending exactly 12 months after start, "
                  "against the mean monthly logo churn of all subscriptions over the 24 months.",
    "FIND-02-08": "Churn events whose subscription has an invoice with 3 or more failed payment attempts with attempted_at in the "
                  "30 days up to the churn's event_date, over all churn events.",
    "FIND-02-09": "usage_weekly rows with LAG(active_users, 8) over the account's weeks; flagged when the lag is above 0 and "
                  "active_users is below half of it; churned when the account has a churn event in the 90 days after week_start; "
                  "weeks to 2025-09-29. Ratio = churn rate of flagged rows over unflagged rows.",
    "FIND-02-10": "Accounts created on or after 2024-01-01 with MRR on 2025-01-01; adopters have ap_module_events > 0 in a week with "
                  "week_start before CAST(created_at AS DATE) + 90. NRR as FIND-02-06, per group; the gap is adopters' minus the rest.",
    "FIND-02-11": "Subscriptions active on 2025-12-31: abs(sum(mrr_local) / sum(mrr_local times the 2025-12-31 rate) - 1).",
    "FIND-02-12": "On ledgerloop_raw: at each month end, the sum of deltas with event_date <= month end (restated) against those also "
                  "recorded by then, recorded_at before the next day (reported); the month ends where they differ.",
    "FIND-02-13": "On ledgerloop_raw: rows beyond the first of each (subscription_id, event_type, event_date, mrr_delta_local); and how "
                  "many of them are expansions.",
    "FIND-02-14": "P1 tickets: median minutes from opened_at to resolved_at (unresolved ones missing) by quarter of opened_at, Q3 "
                  "2025 over Q2 2025. Account-quarters 2024-Q1 to 2025-Q3 with an active subscription on the quarter's last day: "
                  "heavy with 3 or more P1 tickets opened in the quarter; churned with a churn event in the next quarter; the ratio "
                  "of the heavy rows' churn rate to the others'.",
    "FIND-02-15": "Gross margin = 1 - sum(cogs_monthly) / the sum of the 24 month-end MRRs in EUR. Per acquisition_channel: accounts "
                  "with a new event, and the mean of those events in EUR at the event day's rate; CAC = the channel's "
                  "marketing_spend_monthly plus its sm_expense_monthly rows (the shared ones excluded) over the window, over those "
                  "accounts; payback months = CAC / (mean new MRR times gross margin).",
}


def _check(ok: bool, message: str) -> None:
    if not ok:
        raise ValueError(message)


MEASURE_SQL = """
CREATE TEMP TABLE month_ends AS
SELECT CAST(range + INTERVAL 1 MONTH - INTERVAL 1 DAY AS DATE) AS month_end, CAST(range AS DATE) AS month_start
FROM range(DATE '2024-01-01', DATE '2026-01-01', INTERVAL 1 MONTH);
CREATE TEMP TABLE in_force AS
SELECT s.subscription_id, s.account_id, s.currency, s.start_date, s.end_date, s.billing_period, m.month_end, m.month_start,
       coalesce(sum(e.mrr_delta_local) FILTER (WHERE e.event_date <= m.month_end), 0) AS mrr
FROM c_subscriptions s CROSS JOIN month_ends m LEFT JOIN c_subscription_events e USING (subscription_id) GROUP BY ALL;
CREATE TEMP TABLE active_end AS
SELECT s.*, p.plan_name, fx.eur_per_unit FROM c_subscriptions s JOIN c_plans p USING (plan_id)
JOIN c_fx_rates fx ON fx.rate_date = DATE '2025-12-31' AND fx.currency = s.currency
WHERE s.start_date <= DATE '2025-12-31' AND (s.end_date IS NULL OR s.end_date > DATE '2025-12-31');
CREATE TEMP MACRO account_mrr(d) AS TABLE
SELECT s.account_id, any_value(s.currency) AS currency, coalesce(sum(e.mrr_delta_local), 0) AS mrr
FROM c_subscriptions s JOIN c_subscription_events e USING (subscription_id) WHERE e.event_date <= d GROUP BY 1;
CREATE TEMP TABLE cohort AS
SELECT s.account_id, a.created_at, s.mrr * fx.eur_per_unit AS start_eur, coalesce(e.mrr, 0) * fx.eur_per_unit AS end_eur
FROM account_mrr(DATE '2025-01-01') s LEFT JOIN account_mrr(DATE '2025-12-31') e USING (account_id)
JOIN c_fx_rates fx ON fx.rate_date = DATE '2025-12-31' AND fx.currency = s.currency
JOIN c_accounts a ON a.account_id = s.account_id WHERE s.mrr > 0;
CREATE TEMP MACRO churn_rate(seg, plan) AS TABLE
SELECT m.month_start, count(*) FILTER (WHERE s.end_date <= m.month_end) / count(*) AS rate
FROM month_ends m JOIN c_subscriptions s ON s.start_date <= m.month_start AND (s.end_date IS NULL OR s.end_date > m.month_start)
JOIN c_accounts a USING (account_id) JOIN c_plans p USING (plan_id)
WHERE (seg IS NULL OR a.segment = seg) AND (plan IS NULL OR p.plan_name = plan) GROUP BY 1;
"""


def measure(tables: dict) -> dict:
    """Every finding's measures, computed in SQL: the clean tables for findings not about cleaning (OD-GEN-01, E-093), raw for
    FIND-02-12 and -13."""
    con = duckdb.connect(config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    try:
        for prefix, source in (("c", tables["clean"]), ("r", tables["raw"])):
            for name, table in source.items():
                con.register(f"{prefix}_{name}", table)
        con.execute(MEASURE_SQL)

        def one(sql):
            return con.execute(sql).fetchone()

        def rows(sql):
            return con.execute(sql).fetchall()

        m: dict = {}
        logos, mrr = one("""SELECT avg(CASE WHEN plan_name IN ('Scale', 'Enterprise') THEN 1 ELSE 0 END),
                sum(mrr_local * eur_per_unit) FILTER (WHERE plan_name IN ('Scale', 'Enterprise')) / sum(mrr_local * eur_per_unit) FROM active_end""")
        m["FIND-02-01"] = {"logo_share": round(float(logos), 4), "mrr_share": round(float(mrr), 4)}
        by_country = dict(rows("SELECT country_code, count(*) FROM c_accounts GROUP BY 1"))
        pairs = rows("SELECT DISTINCT a.country_code, s.currency FROM c_accounts a JOIN c_subscriptions s USING (account_id)")
        m["FIND-02-02"] = {"top_country": max(by_country, key=by_country.get), "accounts_by_country": dict(sorted(by_country.items())),
                           "currencies": sorted({k for _, k in pairs}),
                           "non_eur_countries": sorted({c for c, k in pairs if k != "EUR"})}
        path = rows("""SELECT f.month_end, sum(f.mrr * fx.eur_per_unit) FROM in_force f
                       JOIN c_fx_rates fx ON fx.rate_date = f.month_end AND fx.currency = f.currency GROUP BY 1 ORDER BY 1""")
        mrr_path = {d.isoformat(): round(float(v), 2) for d, v in path}
        opening = float(one("""SELECT sum(e.mrr_delta_local * fx.eur_per_unit) FROM c_subscription_events e JOIN c_subscriptions s USING (subscription_id)
                               JOIN c_fx_rates fx ON fx.rate_date = DATE '2024-01-01' AND fx.currency = s.currency WHERE e.event_type = 'opening'""")[0])
        m["FIND-02-03"] = {"ratio": round(mrr_path["2025-12-31"] / mrr_path["2024-01-31"], 4), "opening_mrr_eur": round(opening, 2),
                           "month_end_mrr_eur": mrr_path,
                           "feb_apr_2025_growth": round(mrr_path["2025-04-30"] / mrr_path["2025-01-31"] - 1, 4)}
        churn = rows("""SELECT strftime(e.event_date, '%Y-%m') AS month, -sum(e.mrr_delta_local * fx.eur_per_unit)
                        FROM c_subscription_events e JOIN c_subscriptions s USING (subscription_id)
                        JOIN c_fx_rates fx ON fx.rate_date = e.event_date AND fx.currency = s.currency
                        WHERE e.event_type = 'churn' GROUP BY 1 ORDER BY 1""")
        churn_by_month = {k: round(float(v), 2) for k, v in churn}
        m["FIND-02-04"] = {"peak_month": max(churn_by_month, key=churn_by_month.get), "churn_mrr_eur_by_month": churn_by_month}

        def ratio(seg, plan):
            rates = {d.isoformat(): float(v) for d, v in rows(f"SELECT * FROM churn_rate({seg}, {plan})")}
            spike = [rates[f"2025-0{k}-01"] for k in (2, 3, 4, 5)]
            base = [rates[f"2024-{k:02d}-01"] for k in range(1, 13)]
            return (sum(spike) / 4) / (sum(base) / 12)

        m["FIND-02-05"] = {"smb_starter_ratio": round(ratio("'SMB'", "'Starter'"), 4), "mid_market_ratio": round(ratio("'Mid-Market'", "NULL"), 4)}
        grr, nrr, logo = one("""SELECT sum(least(end_eur, start_eur)) / sum(start_eur), sum(end_eur) / sum(start_eur),
                                       avg(CASE WHEN end_eur = 0 THEN 1 ELSE 0 END) FROM cohort""")
        m["FIND-02-06"] = {"grr": round(float(grr), 4), "nrr": round(float(nrr), 4), "logo_churn": round(float(logo), 4),
                           "revenue_churn": round(1 - float(grr), 4)}
        m3 = float(one("""SELECT avg(CASE WHEN s.end_date IS NULL OR s.end_date > s.start_date + INTERVAL 3 MONTH THEN 1 ELSE 0 END)
            FROM c_subscriptions s JOIN c_subscription_events e USING (subscription_id)
            WHERE e.event_type = 'new' AND s.billing_period = 'monthly' AND s.start_date <= DATE '2025-09-30'""")[0])
        m12 = float(one("""SELECT avg(CASE WHEN s.end_date = CAST(s.start_date + INTERVAL 12 MONTH AS DATE) THEN 1 ELSE 0 END)
            FROM c_subscriptions s JOIN c_subscription_events e USING (subscription_id)
            WHERE e.event_type = 'new' AND s.billing_period = 'annual' AND s.start_date <= DATE '2024-12-31'""")[0])
        monthly = float(one("SELECT avg(rate) FROM churn_rate(NULL, NULL)")[0])
        m["FIND-02-07"] = {"month_3_retention": round(m3, 4), "annual_month_12_churn": round(m12, 4),
                           "mean_monthly_churn": round(monthly, 4), "spike_ratio": round(m12 / monthly, 4)}
        share, n_churn = one("""SELECT avg(CASE WHEN EXISTS (
                SELECT 1 FROM c_invoices i JOIN c_payments p USING (invoice_id)
                WHERE i.subscription_id = e.subscription_id AND NOT p.succeeded
                  AND p.attempted_at >= e.event_date - INTERVAL 30 DAY AND p.attempted_at < e.event_date + INTERVAL 1 DAY
                GROUP BY i.invoice_id HAVING count(*) >= 3) THEN 1 ELSE 0 END), count(*)
            FROM c_subscription_events e WHERE e.event_type = 'churn'""")
        m["FIND-02-08"] = {"involuntary_share": round(float(share), 4), "churn_events": n_churn}
        flagged, unflagged, n_flagged = one("""WITH u AS (SELECT account_id, week_start, active_users,
                    lag(active_users, 8) OVER (PARTITION BY account_id ORDER BY week_start) AS lag8 FROM c_usage_weekly),
                ch AS (SELECT DISTINCT account_id, event_date FROM c_subscription_events WHERE event_type = 'churn'),
                f AS (SELECT u.*, lag8 > 0 AND active_users < 0.5 * lag8 AS flag,
                             EXISTS (SELECT 1 FROM ch WHERE ch.account_id = u.account_id AND ch.event_date > u.week_start
                                     AND ch.event_date <= u.week_start + 90) AS churned
                      FROM u WHERE lag8 IS NOT NULL AND week_start <= DATE '2025-09-29')
            SELECT avg(CASE WHEN churned THEN 1 ELSE 0 END) FILTER (WHERE flag), avg(CASE WHEN churned THEN 1 ELSE 0 END) FILTER (WHERE NOT flag),
                   count(*) FILTER (WHERE flag) FROM f""")
        m["FIND-02-09"] = {"ratio": round(float(flagged) / float(unflagged), 4), "flagged_churn_rate": round(float(flagged), 4),
                           "unflagged_churn_rate": round(float(unflagged), 4), "flagged_weeks": n_flagged}
        nrr_by = {bool(k): (float(v), n) for k, v, n in rows("""WITH f AS (SELECT c.*, EXISTS (SELECT 1 FROM c_usage_weekly w
                        WHERE w.account_id = c.account_id AND w.ap_module_events > 0 AND w.week_start < CAST(c.created_at AS DATE) + 90) AS adopter
                    FROM cohort c WHERE c.created_at >= TIMESTAMP '2024-01-01')
            SELECT adopter, sum(end_eur) / sum(start_eur), count(*) FROM f GROUP BY 1""")}
        m["FIND-02-10"] = {"adopter_nrr": round(nrr_by[True][0], 4), "other_nrr": round(nrr_by[False][0], 4),
                           "gap": round(nrr_by[True][0] - nrr_by[False][0], 4), "adopters": nrr_by[True][1], "others": nrr_by[False][1]}
        naive, converted = one("SELECT sum(mrr_local), sum(mrr_local * eur_per_unit) FROM active_end")
        m["FIND-02-11"] = {"gap": round(abs(float(naive) / float(converted) - 1), 4)}
        differing = rows("""SELECT m.month_end FROM month_ends m CROSS JOIN r_subscription_events e GROUP BY 1
            HAVING sum(e.mrr_delta_local) FILTER (WHERE e.event_date <= m.month_end)
                <> sum(e.mrr_delta_local) FILTER (WHERE e.event_date <= m.month_end AND e.recorded_at < m.month_end + INTERVAL 1 DAY)
            ORDER BY 1""")
        m["FIND-02-12"] = {"month_ends_differing": len(differing), "month_ends": [d.isoformat() for (d,) in differing]}
        dupes, expansion = one("""SELECT coalesce(sum(n - 1), 0), coalesce(sum(n - 1) FILTER (WHERE event_type = 'expansion'), 0) FROM (
            SELECT event_type, count(*) AS n FROM r_subscription_events GROUP BY subscription_id, event_type, event_date, mrr_delta_local
            HAVING count(*) > 1)""")
        m["FIND-02-13"] = {"duplicates": int(dupes), "expansion_duplicates": int(expansion)}
        q2, q3 = one("""SELECT median(date_diff('minute', opened_at, resolved_at)) FILTER (WHERE opened_at >= TIMESTAMP '2025-04-01' AND opened_at < TIMESTAMP '2025-07-01'),
                               median(date_diff('minute', opened_at, resolved_at)) FILTER (WHERE opened_at >= TIMESTAMP '2025-07-01' AND opened_at < TIMESTAMP '2025-10-01')
                        FROM c_support_tickets WHERE priority = 'P1'""")
        high, other, n_high = one("""WITH q AS (SELECT CAST(range AS DATE) AS q_start, CAST(range + INTERVAL 3 MONTH AS DATE) AS q_next
                                                FROM range(DATE '2024-01-01', DATE '2025-10-01', INTERVAL 3 MONTH)),
                act AS (SELECT q.q_start, q.q_next, s.account_id FROM q JOIN c_subscriptions s
                        ON s.start_date < q.q_next AND (s.end_date IS NULL OR s.end_date >= q.q_next) GROUP BY ALL),
                p1 AS (SELECT account_id, opened_at FROM c_support_tickets WHERE priority = 'P1'),
                ch AS (SELECT DISTINCT account_id, event_date FROM c_subscription_events WHERE event_type = 'churn'),
                f AS (SELECT act.*, (SELECT count(*) FROM p1 WHERE p1.account_id = act.account_id AND p1.opened_at >= act.q_start
                                     AND p1.opened_at < act.q_next) >= 3 AS heavy,
                             EXISTS (SELECT 1 FROM ch WHERE ch.account_id = act.account_id AND ch.event_date >= act.q_next
                                     AND ch.event_date < act.q_next + INTERVAL 3 MONTH) AS churned FROM act)
            SELECT avg(CASE WHEN churned THEN 1 ELSE 0 END) FILTER (WHERE heavy), avg(CASE WHEN churned THEN 1 ELSE 0 END) FILTER (WHERE NOT heavy),
                   count(*) FILTER (WHERE heavy) FROM f""")
        m["FIND-02-14"] = {"p1_median_ratio": round(float(q3) / float(q2), 4), "q2_p1_median_minutes": float(q2),
                           "q3_p1_median_minutes": float(q3), "churn_ratio": round(float(high) / float(other), 4),
                           "heavy_account_quarters": n_high}
        gm = float(one("""SELECT 1 - (SELECT sum(amount_eur) FROM c_cogs_monthly) / sum(f.mrr * fx.eur_per_unit) FROM in_force f
                          JOIN c_fx_rates fx ON fx.rate_date = f.month_end AND fx.currency = f.currency""")[0])
        payback = {ch: (float(v), n) for ch, v, n in rows(f"""WITH n AS (SELECT a.acquisition_channel AS channel, count(*) AS logos,
                        avg(e.mrr_delta_local * fx.eur_per_unit) AS new_mrr
                    FROM c_accounts a JOIN c_subscription_events e ON e.account_id = a.account_id AND e.event_type = 'new'
                    JOIN c_subscriptions s USING (subscription_id) JOIN c_fx_rates fx ON fx.rate_date = e.event_date AND fx.currency = s.currency
                    GROUP BY 1),
                cost AS (SELECT channel, sum(amount) AS cost FROM (SELECT channel, spend_eur AS amount FROM c_marketing_spend_monthly
                         UNION ALL SELECT channel, amount_eur FROM c_sm_expense_monthly) GROUP BY 1)
            SELECT n.channel, (cost.cost / n.logos) / (n.new_mrr * {gm}), n.logos FROM n JOIN cost USING (channel)""")}
        m["FIND-02-15"] = {"gross_margin": round(gm, 4), "payback_months": {ch: round(v, 2) for ch, (v, _) in sorted(payback.items())},
                           "new_accounts": {ch: n for ch, (_, n) in sorted(payback.items())}}
        m["structure"] = structure(one, rows)
        return m
    finally:
        con.close()


def structure(one, rows) -> dict:
    """S8-02, S8-03, S8-05 and S8-06's rules on the clean tables, measured for check()."""
    s = {}
    s["opening_mrr_eur"] = float(one("""SELECT sum(e.mrr_delta_local * fx.eur_per_unit) FROM c_subscription_events e JOIN c_subscriptions s USING (subscription_id)
                                        JOIN c_fx_rates fx ON fx.rate_date = DATE '2024-01-01' AND fx.currency = s.currency WHERE e.event_type = 'opening'""")[0])
    s["events_by_type"] = dict(rows("SELECT event_type, count(*) FROM c_subscription_events GROUP BY 1 ORDER BY 1"))
    s["new_on_first_day"] = one("SELECT count(*) FROM c_subscription_events WHERE event_type = 'new' AND event_date = DATE '2024-01-01'")[0]
    s["legacy_new_events"] = one("""SELECT count(*) FROM c_subscription_events e JOIN c_accounts a USING (account_id)
                                    WHERE e.event_type = 'new' AND a.created_at < TIMESTAMP '2024-01-01'""")[0]
    s["returning_typed_new"] = one("""SELECT count(*) FROM c_subscription_events e JOIN c_subscriptions s USING (subscription_id)
        WHERE e.event_type = 'new' AND EXISTS (SELECT 1 FROM c_subscriptions p WHERE p.account_id = s.account_id AND p.start_date < s.start_date)""")[0]
    s["in_force_mismatches"] = one("""SELECT count(*) FROM in_force
        WHERE (mrr > 0) <> (start_date <= month_end AND (end_date IS NULL OR end_date > month_end)) OR mrr < 0""")[0]
    s["mrr_local_mismatches"] = one("""SELECT count(*) FROM c_subscriptions s
        JOIN (SELECT subscription_id, sum(mrr_delta_local) AS total, sum(mrr_delta_local) FILTER (WHERE event_type <> 'churn') AS before_end
              FROM c_subscription_events GROUP BY 1) e USING (subscription_id)
        WHERE (s.end_date IS NULL AND e.total <> s.mrr_local) OR (s.end_date IS NOT NULL AND (e.total <> 0 OR e.before_end <> s.mrr_local))""")[0]
    s["monthly_invoice_mismatches"] = one("""SELECT count(*) FROM c_invoices i JOIN c_subscriptions s USING (subscription_id)
        WHERE s.billing_period = 'monthly' AND i.amount_local <> (SELECT sum(e.mrr_delta_local) FROM c_subscription_events e
                                                                  WHERE e.subscription_id = i.subscription_id AND e.event_date <= i.invoice_date)""")[0]
    s["business_key_duplicates"] = one("""SELECT count(*) FROM (SELECT subscription_id, event_type, event_date, mrr_delta_local
                                          FROM c_subscription_events GROUP BY ALL HAVING count(*) > 1)""")[0]
    s["won_without_account"] = one("""SELECT count(*) FROM c_opportunities o LEFT JOIN c_accounts a USING (account_id)
        WHERE (o.is_won IS TRUE) <> (o.account_id IS NOT NULL) OR (o.is_won AND (a.account_id IS NULL OR a.created_at < o.closed_at))""")[0]
    s["app_events"] = one("SELECT count(*) FROM c_app_events")[0]
    s["clean_test_like_accounts"] = one("SELECT count(*) FROM c_accounts WHERE is_test OR account_name ILIKE '%test%'")[0]
    return s


def check(m: dict, truth: dict) -> None:
    """05's validation table, FIND-02-01 to -15, each with its band, then S8-02 to S8-06's rules; raises ValueError naming the
    first that fails. The messages name the finding and its band, never a measured value."""
    f = m["FIND-02-01"]
    _check(0.15 <= f["logo_share"] <= 0.25 and 0.5 <= f["mrr_share"] <= 0.7, "FIND-02-01: Scale plus Enterprise logo share 0.15-0.25, MRR share 0.5-0.7")
    f = m["FIND-02-02"]
    _check(f["top_country"] == "DE" and f["currencies"] == ["CHF", "EUR", "GBP"] and f["non_eur_countries"] == ["CH", "GB"],
           "FIND-02-02: DE has the most accounts; currencies EUR, GBP, CHF, only GB and CH outside EUR")
    f = m["FIND-02-03"]
    _check(1.6 <= f["ratio"] <= 1.9, "FIND-02-03: Dec 2025 MRR over Jan 2024 MRR 1.6-1.9")
    f = m["FIND-02-04"]
    _check(f["peak_month"] == "2025-03", "FIND-02-04: churn MRR peaks in 2025-03")
    f = m["FIND-02-05"]
    _check(1.7 <= f["smb_starter_ratio"] <= 2.4 and 0.8 <= f["mid_market_ratio"] <= 1.2,
           "FIND-02-05: SMB Starter churn ratio 1.7-2.4, mid-market 0.8-1.2")
    f = m["FIND-02-06"]
    _check(0.86 <= f["grr"] <= 0.90 and 1.02 <= f["nrr"] <= 1.06 and f["logo_churn"] > f["revenue_churn"],
           "FIND-02-06: GRR 0.86-0.90, NRR 1.02-1.06, logo churn above revenue churn")
    f = m["FIND-02-07"]
    _check(0.87 <= f["month_3_retention"] <= 0.93 and f["spike_ratio"] > 3, "FIND-02-07: month-3 retention 0.87-0.93; month-12 spike above 3x")
    f = m["FIND-02-08"]
    _check(0.15 <= f["involuntary_share"] <= 0.21, "FIND-02-08: involuntary share of churn 0.15-0.21")
    f = m["FIND-02-09"]
    _check(f["ratio"] >= 4, "FIND-02-09: flagged over unflagged churn rate at least 4")
    f = m["FIND-02-10"]
    _check(f["gap"] >= 0.15, "FIND-02-10: adopter NRR at least 0.15 above the rest")
    f = m["FIND-02-11"]
    _check(0.02 <= f["gap"] <= 0.04, "FIND-02-11: naive over converted MRR off by 0.02-0.04")
    f = m["FIND-02-12"]
    _check(f["month_ends_differing"] >= 6, "FIND-02-12: at least 6 month ends where reported MRR differs from restated")
    f = m["FIND-02-13"]
    _check(180 <= f["duplicates"] <= 240 and f["expansion_duplicates"] * 2 > f["duplicates"], "FIND-02-13: 180-240 duplicate events, most of them expansions")
    f = m["FIND-02-14"]
    _check(f["p1_median_ratio"] >= 1.5 and f["churn_ratio"] >= 2.5, "FIND-02-14: Q3/Q2 P1 median at least 1.5; heavy-P1 churn ratio at least 2.5")
    f = m["FIND-02-15"]
    _check(5 <= f["payback_months"]["partner"] <= 9 and 17 <= f["payback_months"]["paid_search"] <= 23,
           "FIND-02-15: partner payback 5-9 months, paid search 17-23")
    s = m["structure"]
    _check(850_000 <= s["opening_mrr_eur"] <= 950_000, "S8-02: the opening events sum to EUR 0.85M-0.95M MRR")
    _check(s["events_by_type"].get("contraction", 0) >= 150 and s["events_by_type"].get("reactivation", 0) >= 60,
           "S8-02: at least 150 contraction and 60 reactivation events")
    _check(s["legacy_new_events"] == 0 and s["returning_typed_new"] == 0, "S8-02, S8-03: no legacy or returning account has a new event")
    _check(s["new_on_first_day"] == 0, "S8-02: every subscription active on 2024-01-01 opens with a balance (no new event that day)")
    _check(s["in_force_mismatches"] == 0 and s["mrr_local_mismatches"] == 0 and s["monthly_invoice_mismatches"] == 0,
           "S8-02: the events sum to every subscription's MRR in force")
    _check(s["business_key_duplicates"] == 0, "clean: no two events share a business key")
    _check(s["won_without_account"] == 0, "S8-05: a won opportunity's account exists and is created on or after the close")
    _check(135_000 <= s["app_events"] <= 165_000, "S8-06: about 150,000 app events")
    _check(s["clean_test_like_accounts"] == 0, "clean: no test account")
    plants = truth["planted"]["app_events"]
    _check(bool(plants.get("clock_change_user")) and set(plants.get("gaps_seconds", [])) >= {1799, 1800, 1801},
           "S8-06: the clock-change user and the near-30-minute gaps are planted")


def validate(tables: dict, truth: dict) -> dict:
    """GEN-01: the raw quirks first (each exists in raw and not in clean, with the truth's count), then every finding and rule.
    Returns the measured findings, each marked pass, and the quirks' measures under "raw". Explicit raises, not assert."""
    from . import raw as ll_raw
    quirks = ll_raw.validate(tables, truth)
    m = measure(tables)
    check(m, truth)
    for k, f in m.items():
        if k.startswith("FIND-"):
            f["pass"] = True
    m["raw"] = quirks
    return m

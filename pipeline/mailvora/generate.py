"""Mailvora (knowledge/05 CO-03) generator: sprint 6 Part 2, Task G1 (S6-20; E-086, E-107, E-196; rulings P31 to P34).

GEN-01: generate() returns the clean and raw tables as pyarrow Tables with the truth; validate() measures every planted finding
in SQL and raises ValueError, naming it, on the first one outside 05's band. GEN-02: one child Generator per entry of
TABLE_ORDER, spawned from SeedSequence(3303) in 05's CO-03 generation order with budget_monthly and countries appended, so
changing one table never shifts another; nothing here touches Voltmarkt's streams. GEN-03: the plants are the constants below.
GEN-04: the clean tables first, then raw.inject_quirks() on copies. OD-GEN-01: the truth goes to data/truth/mailvora.json only.

The model, in 05's order:
- Spend per campaign per UTC day (E-086), from monthly plans, a weekday profile and noise. LinkedIn bills in US dollars: the
  clean row holds its euros at the month's rate, and raw keeps the dollars (Q-03-03).
- Daily signups per last-touch channel ("journeys"). A paid channel's come from weekly geometric adstock and Hill saturation of
  its spend (05's alphas; Meta's Hill ec 15,000 EUR a week, slope 1.5), shared over the week's days by each day's spend; brand
  search's from brand demand, paused 2025-05-05 to 06-01, when 80% of its signups arrive through organic and direct instead;
  organic, direct and referral from a baseline. YouTube flights also start journeys that close 1 to 8 weeks later, most
  within 3, mostly through brand search (the halo; the adstock alpha 0.7 is the decay of that lag).
- Visitors and sessions: each signup's path back-filled before it (the first touch, middle touches, the last touch minutes
  before the signup), sessions after some signups, then visitors who never sign up. Every session maps to exactly one channel
  by the E-196 rule (notes.CHANNEL_RULE), and a session from a campaign is a click, on a UTC day that campaign had clicks.
- Signups in each user's local time (countries.timezone), activation, subscriptions with plan changes and churn, and monthly
  payments, 4% of them refunded (a business state, P32).
Every rate, size and weight below is a calibration estimate chosen so that 05's findings hold, unless a comment cites 05.
"""
from __future__ import annotations

import datetime as dt
import re

import duckdb
import numpy as np
import pyarrow as pa

SEED = 3303                                              # 05 §5: CO-03's seed
TABLE_ORDER = ["calendar", "fx_rates_monthly", "channels", "campaigns", "ad_spend_daily", "daily_signups_model",
               "sessions", "signups", "activation_events", "subscriptions", "payments", "quirks",
               "budget_monthly", "countries"]          # 05's CO-03 order, then S6-20's two tables (append only, E-090)
CLEAN_TABLES = ("channels", "campaigns", "ad_spend_daily", "fx_rates_monthly", "sessions", "signups", "activation_events",
                "subscriptions", "payments", "budget_monthly", "countries")
WINDOW_START = dt.date(2024, 1, 1)
WINDOW_END = dt.date(2025, 12, 31)
DAYS = (WINDOW_END - WINDOW_START).days + 1             # 731
DAY0 = (WINDOW_START - dt.date(1970, 1, 1)).days         # the window's first day in days since 1970
AS_OF_DATE = "2026-01-05"                                 # design §10: just after the data window
NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17

# ---- channels (05 CO-03: ten channels; the short names are this build's, S6-20) -------------------------------------------
CHANNELS = (  # channel_id, channel_name, channel_group, cost_model
    (1, "nonbrand_search", "paid_search", "cpc"),
    (2, "brand_search", "paid_search", "cpc"),
    (3, "meta", "paid_social", "cpm"),
    (4, "linkedin", "paid_social", "cpc"),
    (5, "youtube", "paid_video", "cpm"),
    (6, "review_sites", "paid_partner", "cpc"),
    (7, "affiliates", "paid_partner", "cpa"),
    (8, "organic", "unpaid", "none"),
    (9, "direct", "unpaid", "none"),
    (10, "referral", "unpaid", "none"),
)
NB, BR, META, LI, YT, RV, AFF, ORG, DIR, REF = range(10)
NAMES = [c[1] for c in CHANNELS]
PAID = (NB, BR, META, LI, YT, RV, AFF)

# ---- campaigns: 05 CO-03's 180 ---------------------------------------------------------------------------------------------
NB_THEMES = ("email marketing software", "newsletter tool", "email automation", "mailchimp alternative", "email templates",
             "bulk email service", "transactional email", "email list builder", "small business email", "drip campaigns",
             "landing page builder", "signup forms", "email marketing pricing", "free email marketing", "ecommerce email",
             "email analytics", "ab testing email", "email deliverability", "newsletter software", "email for restaurants",
             "email for nonprofits", "email for shops", "event invitations", "customer newsletters")
BRAND_TERMS = ("mailvora", "mailvora login", "mailvora pricing", "mailvora reviews")
META_AUDIENCES = ("lookalike signups", "small business owners", "shop owners", "coaches", "restaurants", "nonprofits",
                  "creators", "event planners", "real estate", "fitness studios", "salons", "agencies")
META_OBJECTIVES = ("prospecting", "retargeting")
LI_AUDIENCES = ("marketing managers", "smb founders", "agency owners", "ecommerce managers", "nonprofit comms",
                "internal comms", "sales leaders", "event marketers", "b2b saas")
# YouTube runs two-week flights (two creatives each), none from February to the brand pause's end, so FIND-03-07's two
# windows see no halo, and enough weeks off for FIND-03-06's lags to show.
YT_FLIGHTS = ("2024-01-22", "2024-03-18", "2024-05-13", "2024-07-08", "2024-09-09", "2024-11-04",
              "2025-01-13", "2025-06-16", "2025-08-04", "2025-09-15", "2025-10-20", "2025-11-24")
YT_FLIGHT_DAYS = 14
YT_CREATIVES = ("tutorial", "brand story")
REVIEW_LISTINGS = (("capterra", "email marketing"), ("capterra", "marketing automation"), ("capterra", "newsletter"),
                   ("g2", "email marketing"), ("g2", "marketing automation"), ("g2", "newsletter"))
AFF_PARTNERS = ("dealhub", "smbtools", "growthclub", "mailmentor", "startupstack", "ecomtips", "freelancerhub", "creatorkit",
                "shopfounders", "nonprofitnet", "eventpro")
DEALHUB = "dealhub"                                     # 05 FIND-03-08's junk affiliate
YEARS = (2024, 2025)

# ---- the spend plan (EUR per day unless named) -----------------------------------------------------------------------------
SEASON = np.array([1.05, 1.05, 1.05, 1.0, 1.0, 0.95, 0.85, 0.80, 1.05, 1.10, 1.05, 0.85])   # by month; April = May (FIND-03-07)
GROWTH = 0.12                                            # demand grows 12% over the window
NB_DAILY = {2024: 4300.0, 2025: 4400.0}
BRAND_DAILY = 760.0
# Meta's weekly spend (thousand EUR) by month: weeks on both sides of 05's 18,000 EUR (FIND-03-05), and Q3 2025 over budget.
META_WEEKLY = {2024: (10, 12, 16, 20, 24, 14, 9, 8, 22, 30, 36, 18), 2025: (12, 15, 20, 22, 22, 26, 34, 38, 40, 26, 30, 16)}
LI_DAILY = {2024: 1600.0, 2025: 2000.0}
YT_DAILY_PER_CAMPAIGN = 2500.0
RV_DAILY = 20.0                                          # review sites: low volume (05)
AFF_DAILY = {DEALHUB: {2024: 125.0, 2025: 130.0}, "other": {2024: 29.0, 2025: 29.0}}
# Weekday profiles, Monday first, each scaled to a mean of 1. LinkedIn is weekday-heavy, peaks on Tuesday and is as quiet on
# Monday as at the weekend, so the one large step in its week is Monday to Tuesday: on raw, the row labelled Monday carries
# Tuesday's spend over Monday's signups, and Monday has the highest weekday CPA (FIND-03-11, review Important 1). Meta leans to
# the weekend (FIND-03-14).
SEARCH_WD = (1.10, 1.20, 1.15, 1.05, 0.95, 0.70, 0.75)
META_WD = (0.80, 0.80, 0.80, 0.85, 1.05, 1.45, 1.45)
LI_WD = (0.55, 1.45, 1.40, 1.30, 1.05, 0.45, 0.45)
FLAT_WD = (1.0,) * 7
AFF_WD = (1.05, 1.10, 1.10, 1.00, 0.95, 0.85, 0.95)
UNPAID_WD = (1.05, 1.20, 1.15, 1.05, 0.90, 0.65, 0.70)
CHANNEL_WD = {NB: SEARCH_WD, BR: SEARCH_WD, META: META_WD, LI: LI_WD, YT: FLAT_WD, RV: SEARCH_WD, AFF: AFF_WD}
SPEND_NOISE = (0.08, 0.12)                               # lognormal sigma: channel-day, then campaign-day
CPC = {NB: 2.40, BR: 0.55, META: 0.95, LI: 6.00, YT: 2.80, RV: 3.10, AFF: 1.80}       # FIND-03-02: LinkedIn about 6 EUR
CTR = {NB: 0.035, BR: 0.070, META: 0.011, LI: 0.0055, YT: 0.0035, RV: 0.090, AFF: 0.025}   # review sites highest
# 05 FIND-03-13: monthly USD rates 0.86 to 0.93 euros per dollar.
FX = {"start": 0.924, "drift": -0.0025, "step": 0.006, "low": 0.862, "high": 0.928}

PLANTS = {
    "brand_pause": {"start": "2025-05-05", "end": "2025-06-01", "organic_recovery": 0.8,
                    "to_organic": 0.6, "to_direct": 0.2},                                  # 05 CO-03
    "meta_saturation": {"ec_eur_week": 15000, "slope": 1.5, "threshold_eur_week": 18000},  # 05 CO-03, FIND-03-05
    "linkedin_export": {"timezone": "America/Los_Angeles", "currency": "USD", "day_shift": -1},   # Q-03-02, Q-03-03, P33
    "meta_reimport": ["2025-07-14", "2025-07-15"],                                          # Q-03-04
    "budget": {"meta_q3_2025_weekly_budget_eur": 27000, "linkedin_q3_2025_spend_share": 0.65},   # MKT-02, S6-20
    "dealhub": {"activation": 0.05, "disposable_share": 0.6},                               # 05 FIND-03-08
    "refund_share": 0.04,                                                                     # 05 Q-03-07
    "youtube_flights": list(YT_FLIGHTS),
}
PAUSE = (dt.date.fromisoformat(PLANTS["brand_pause"]["start"]), dt.date.fromisoformat(PLANTS["brand_pause"]["end"]))
META_Q3_BUDGET_WEEKLY = PLANTS["budget"]["meta_q3_2025_weekly_budget_eur"]
LI_UNDERSPEND = PLANTS["budget"]["linkedin_q3_2025_spend_share"]

# ---- the signup model ------------------------------------------------------------------------------------------------------
ALPHA = {NB: 0.3, BR: 0.3, META: 0.5, LI: 0.4, YT: 0.7, RV: 0.3}    # 05 CO-03: search 0.3, Meta 0.5, YouTube 0.7, LinkedIn 0.4
# Weekly Hill response: (beta: signups a week at saturation, ec: EUR a week at half of it, slope).
HILL = {NB: (600.0, 50000.0, 1.0), META: (250.0, 15000.0, 1.5), LI: (250.0, 80000.0, 1.0), RV: (60.0, 340.0, 1.0)}
YT_LT_CPA = 350.0                                        # YouTube's own last-touch signups: one per 350 EUR of a flight day
AFF_CPA = {DEALHUB: 15.0, "other": 50.0}                 # affiliates are paid per signup
BASE = {BR: 10.0, ORG: 37.0, DIR: 17.0, REF: 6.5}         # signups a day before season, growth and weekday
HALO_PER_EUR = 0.0143                                    # YouTube journeys started per EUR of a flight day
HALO_KERNEL_WEEKS = 8                                     # 05: adstock_max_lag_weeks; weight 0.7 ** (k - 1) for k weeks later
HALO_LT = ((BR, 0.50), (ORG, 0.28), (DIR, 0.22))
COUNT_NOISE = {"paid": 0.08, "steady": 0.025}             # lognormal sigma of a day's expected count

# ---- paths ------------------------------------------------------------------------------------------------------------------
MULTI = {NB: 0.25, BR: 0.35, META: 0.55, LI: 0.25, YT: 0.05, RV: 0.45, AFF: 0.10, ORG: 0.22, DIR: 0.35, REF: 0.25}
FIRST_TOUCH = {   # the first touch of a multi-channel path, by its last touch (the YouTube halo's start with YouTube)
    NB: ((ORG, 0.45), (META, 0.10), (REF, 0.25), (RV, 0.20)),
    BR: ((NB, 0.40), (ORG, 0.30), (META, 0.08), (LI, 0.12), (REF, 0.10)),
    META: ((ORG, 0.40), (NB, 0.40), (DIR, 0.10), (REF, 0.10)),
    LI: ((ORG, 0.40), (NB, 0.40), (DIR, 0.20)),
    YT: ((ORG, 0.50), (DIR, 0.50)),
    RV: ((NB, 0.60), (ORG, 0.40)),
    AFF: ((ORG, 0.50), (NB, 0.40), (META, 0.10)),
    ORG: ((NB, 0.35), (REF, 0.30), (META, 0.08), (LI, 0.12), (DIR, 0.15)),
    DIR: ((ORG, 0.40), (NB, 0.35), (META, 0.08), (REF, 0.10), (LI, 0.07)),
    REF: ((ORG, 0.55), (NB, 0.35), (META, 0.10)),
}
FIRST_TOUCH_LAG = (1, 22)                                 # integers(low, high): 1 to 21 days before the signup
MULTI_LENGTH = ((2, 0.70), (3, 0.25), (4, 0.05))           # sessions in a multi-channel path
SINGLE_LENGTH = ((1, 0.60), (2, 0.30), (3, 0.10))          # sessions in a one-channel path
EARLIER_LAG = (1, 15)                                     # an earlier one-channel session: 1 to 14 days before
AFTER_SIGNUP = {"share": 0.25, "count": ((1, 0.5), (2, 0.3), (3, 0.2)), "days": (1, 61), "channels": ((DIR, 0.7), (ORG, 0.3))}
# Non-converting traffic: each channel's share of all clean sessions (05 FIND-03-12: Meta about 24%).
SESSION_SHARE = {META: 0.24, NB: 0.16, ORG: 0.25, DIR: 0.13, BR: 0.06, REF: 0.05, LI: 0.03, YT: 0.03, AFF: 0.04, RV: 0.01}
SESSIONS_TOTAL = 2_000_000                                 # 05 CO-03
VISITOR_GEOMETRIC = 0.65                                  # sessions per non-converting visitor: 1 + geometric
VISITOR_GAP = (1, 11)                                     # days between a visitor's sessions
BUSINESS_HOURS = (0.15, 0.08, 0.05, 0.05, 0.05, 0.10, 0.30, 0.80, 1.60, 2.60, 3.40, 3.30, 2.60, 2.70, 2.90, 2.80, 2.50, 2.00,
                  1.50, 1.30, 1.30, 1.10, 0.70, 0.35)     # local hours; FIND-03-14's 10:00 peak
META_HOURS = (0.30, 0.15, 0.08, 0.05, 0.05, 0.10, 0.30, 0.60, 0.90, 1.10, 1.20, 1.20, 1.30, 1.30, 1.20, 1.20, 1.30, 1.50,
              1.90, 2.40, 2.90, 3.00, 2.40, 1.20)          # evenings (FIND-03-14)
EARLIEST_HOUR = 6                                  # brand, YouTube, review sites and day-one signups: local 06:00 or later
LANDING = {
    NB: (("/", 0.25), ("/pricing", 0.20), ("/features", 0.20), ("/compare/mailchimp-alternative", 0.15), ("/templates", 0.20)),
    BR: (("/", 0.60), ("/pricing", 0.25), ("/login", 0.15)),
    META: (("/lp/free-newsletter", 0.50), ("/lp/grow-your-list", 0.30), ("/", 0.20)),
    LI: (("/lp/b2b-email", 0.60), ("/features/automation", 0.40)),
    YT: (("/", 0.50), ("/tutorials", 0.50)),
    RV: (("/pricing", 0.50), ("/features", 0.50)),
    AFF: (("/lp/deal", 0.60), ("/pricing", 0.40)),
    ORG: (("/blog/email-subject-lines", 0.20), ("/blog/newsletter-ideas", 0.20), ("/blog/gdpr-email-consent", 0.15), ("/", 0.25),
          ("/templates", 0.20)),
    DIR: (("/", 0.70), ("/pricing", 0.20), ("/login", 0.10)),
    REF: (("/", 0.50), ("/blog/newsletter-ideas", 0.25), ("/pricing", 0.25)),
}
DEVICES = ("desktop", "mobile", "tablet")
DEVICE_MIX = {META: (0.25, 0.70, 0.05), LI: (0.70, 0.27, 0.03)}
DEVICE_DEFAULT = (0.62, 0.33, 0.05)
ORGANIC_SOURCES = (("google", 0.80), ("bing", 0.12), ("duckduckgo", 0.05), ("ecosia", 0.03))
REFERRERS = ("emailtoolsweekly.com", "smallbizhub.eu", "reddit.com", "producthunt.com", "news.ycombinator.com", "medium.com",
             "indiehackers.com", "techradar.com", "zapier.com", "shopify.com", "wordpress.org", "canva.com")
PAID_SOURCE = {NB: "google", BR: "google", META: "facebook", LI: "linkedin", YT: "youtube"}   # review and affiliates: their site
PAID_MEDIUM = {NB: "cpc", BR: "cpc", META: "paid_social", LI: "paid_social", YT: "video", RV: "cpc", AFF: "affiliate"}

# ---- countries (E-107) and signups ------------------------------------------------------------------------------------------
COUNTRIES = {"AT": "Europe/Vienna", "BE": "Europe/Brussels", "CZ": "Europe/Prague", "DE": "Europe/Berlin",
             "DK": "Europe/Copenhagen", "ES": "Europe/Madrid", "FI": "Europe/Helsinki", "FR": "Europe/Paris",
             "GR": "Europe/Athens", "IE": "Europe/Dublin", "IT": "Europe/Rome", "NL": "Europe/Amsterdam",
             "PL": "Europe/Warsaw", "PT": "Europe/Lisbon", "RO": "Europe/Bucharest", "SE": "Europe/Stockholm"}
COUNTRY_MIX = {"AT": 0.03, "BE": 0.04, "CZ": 0.015, "DE": 0.18, "DK": 0.02, "ES": 0.10, "FI": 0.02, "FR": 0.13, "GR": 0.02,
               "IE": 0.12, "IT": 0.09, "NL": 0.10, "PL": 0.05, "PT": 0.04, "RO": 0.015, "SE": 0.03}
DISPOSABLE_DOMAINS = ("mailinator.com", "guerrillamail.com", "tempmail.dev", "yopmail.com", "trashmail.io", "10minutemail.net")
DISPOSABLE_SHARE = 0.012                                  # outside dealhub
FREE_MAIL = ("gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "proton.me")
LOCAL_MAIL = {"AT": "gmx.at", "BE": "telenet.be", "CZ": "seznam.cz", "DE": "gmx.de", "DK": "mail.dk", "ES": "telefonica.net",
              "FI": "elisanet.fi", "FR": "orange.fr", "GR": "otenet.gr", "IE": "eircom.net", "IT": "libero.it", "NL": "ziggo.nl",
              "PL": "wp.pl", "PT": "sapo.pt", "RO": "yahoo.ro", "SE": "telia.se"}
FREE_SHARE = 0.45
BUSINESS_WORDS = (("atelier", "bakery", "bloom", "blue", "bright", "casa", "city", "coast", "craft", "dental", "eco", "fresh",
                   "golden", "green", "harbour", "home", "kind", "little", "maple", "north", "oak", "pixel", "river", "rose",
                   "salt", "smart", "south", "spark", "studio", "sun", "true", "urban", "vita", "west", "wild", "zen"),
                  ("bikes", "books", "cafe", "clinic", "coffee", "consult", "design", "events", "fitness", "flowers", "foods",
                   "garden", "hair", "labs", "media", "pets", "print", "shop", "travel", "works"))
# ---- the funnel, by last-touch channel (05 CO-03: activation 45%, dealhub 5%; activation to paid 20%) -----------------------
ACTIVATION = {NB: 0.45, BR: 0.52, META: 0.36, LI: 0.48, YT: 0.40, RV: 0.62, AFF: 0.44, ORG: 0.52, DIR: 0.50, REF: 0.50}
TO_PAID = {NB: 0.19, BR: 0.23, META: 0.15, LI: 0.24, YT: 0.17, RV: 0.30, AFF: 0.18, ORG: 0.23, DIR: 0.22, REF: 0.22}
PLANS = (("Lite", 15), ("Pro", 45), ("Business", 120))   # 05 CO-03: EUR a month
PLAN_MIX = {NB: (0.48, 0.40, 0.12), BR: (0.40, 0.44, 0.16), META: (0.65, 0.29, 0.06), LI: (0.40, 0.44, 0.16),
            YT: (0.52, 0.38, 0.10), RV: (0.20, 0.45, 0.35), AFF: (0.55, 0.36, 0.09), ORG: (0.30, 0.45, 0.25),
            DIR: (0.42, 0.43, 0.15), REF: (0.42, 0.43, 0.15)}
DEALHUB_FUNNEL = {"activation": PLANTS["dealhub"]["activation"], "to_paid": 0.10, "plan_mix": (0.80, 0.18, 0.02), "churn": 1.5}
CHURN = 0.05                                              # 05 CO-03: paid churn 5% a month
META_CHURN = 1.4                                          # 05 CO-03: Meta cohorts x1.4
PLAN_CHANGE = 0.085                                       # a month's chance of a plan change (three in four upgrade)
UPGRADE_SHARE = 0.75
RESUBSCRIBE = {"share": 0.15, "days": (30, 121)}
ACTIVATION_DELAY_HOURS = (20.0, 1.0, 30 * 24)             # lognormal median, sigma, cap
PAID_DELAY_DAYS = (18.0, 1, 120)                          # exponential mean, minimum, cap
EXTRA_EVENTS = 2.9                                        # Poisson mean of activation events after first_campaign_sent
EVENT_MIX = (("campaign_sent", 0.55), ("list_imported", 0.20), ("automation_created", 0.15), ("form_published", 0.10))
EVENT_SPAN_DAYS = 120
REFUND_SHARE = PLANTS["refund_share"]
BILLING_HOURS = (1, 6)                                    # payments run 01:00 to 05:59 UTC


def rngs(seed: int = SEED) -> dict[str, np.random.Generator]:
    children = np.random.SeedSequence(seed).spawn(len(TABLE_ORDER))
    return {name: np.random.default_rng(child) for name, child in zip(TABLE_ORDER, children)}


# ---- small helpers ----------------------------------------------------------------------------------------------------------

DATES = [WINDOW_START + dt.timedelta(n) for n in range(DAYS)]
WEEKDAY = np.arange(DAYS) % 7                            # 2024-01-01 is a Monday
MONTH = np.array([(x.year - 2024) * 12 + x.month - 1 for x in DATES])     # 0 to 23
YEAR = np.array([x.year for x in DATES])
TREND = 1 + GROWTH * np.arange(DAYS) / (DAYS - 1)
PAUSE_DAYS = np.array([PAUSE[0] <= x <= PAUSE[1] for x in DATES])
MONTH_STARTS = [dt.date(2024 + i // 12, i % 12 + 1, 1) for i in range(24)]


def day_index(x: dt.date) -> int:
    return (x - WINDOW_START).days


def weekday_profile(weights) -> np.ndarray:
    w = np.asarray(weights, dtype=float)
    return (w / w.mean())[WEEKDAY]


def lognormal(rng: np.random.Generator, sigma: float, size) -> np.ndarray:
    """Multiplicative noise with mean 1."""
    return np.exp(sigma * rng.standard_normal(size) - sigma ** 2 / 2)


def draw_counts(rng: np.random.Generator, expected: np.ndarray, sigma: float) -> np.ndarray:
    """A day's count: its expectation times lognormal noise, rounded up or down at random (low variance)."""
    e = np.asarray(expected, dtype=float) * lognormal(rng, sigma, np.shape(expected))
    base = np.floor(e)
    return (base + (rng.random(np.shape(e)) < e - base)).astype(np.int64)


def pick(rng: np.random.Generator, options, size: int) -> np.ndarray:
    """Indices into `options`, a tuple of (value, weight)."""
    p = np.array([w for _, w in options], dtype=float)
    return rng.choice(len(options), size=size, p=p / p.sum())


def decimal_array(units: np.ndarray, precision: int, scale: int) -> pa.Array:
    """DECIMAL(precision, scale) from whole units of 10 ** -scale, without a Decimal per value (little-endian 128-bit)."""
    c = np.ascontiguousarray(units, dtype=np.int64)
    words = np.empty((len(c), 2), dtype=np.int64)
    words[:, 0] = c
    words[:, 1] = np.where(c < 0, -1, 0)
    return pa.Array.from_buffers(pa.decimal128(precision, scale), len(c), [None, pa.py_buffer(words.tobytes())])


def timestamps(seconds: np.ndarray) -> pa.Array:
    """TIMESTAMPTZ (UTC) from seconds since 1970."""
    return pa.array(np.asarray(seconds, dtype=np.int64) * 1_000_000, pa.timestamp("us", tz="UTC"))


def dates(days: np.ndarray) -> pa.Array:
    """DATE from window day indices (0 is 2024-01-01)."""
    return pa.array((np.asarray(days, dtype=np.int64) + DAY0).astype(np.int32), pa.date32())


def strings(values, indices: np.ndarray, missing: np.ndarray | None = None) -> pa.Array:
    """VARCHAR from indices into `values` (a missing value where `missing`)."""
    idx = pa.array(np.asarray(indices, dtype=np.int32), mask=missing)
    return pa.DictionaryArray.from_arrays(idx, pa.array(list(values), pa.string())).cast(pa.string())


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def add_months(day: dt.date, months: int) -> dt.date:
    y, m = divmod(day.month - 1 + months, 12)
    year, month = day.year + y, m + 1
    nxt = dt.date(year + (month == 12), month % 12 + 1, 1)
    return dt.date(year, month, min(day.day, (nxt - dt.timedelta(1)).day))


# ---- channels, campaigns, fx ------------------------------------------------------------------------------------------------

def build_channels() -> pa.Table:
    return pa.table({
        "channel_id": pa.array([c[0] for c in CHANNELS], pa.int32()),
        "channel_name": [c[1] for c in CHANNELS], "channel_group": [c[2] for c in CHANNELS], "cost_model": [c[3] for c in CHANNELS],
    })


def campaign_specs() -> list[dict]:
    """05 CO-03's 180 campaigns, by channel, then year. A year's campaigns run from 1 January to 31 December (brand search's
    stay open over the pause, with no spend); a YouTube campaign runs its two-week flight."""
    specs = []

    def add(ch, name, utm, start, end, source, partner=None):
        specs.append({"ch": ch, "name": name, "utm": utm, "start": start, "end": end, "source": source, "partner": partner})

    for year in YEARS:
        first, last = dt.date(year, 1, 1), dt.date(year, 12, 31)
        for theme in NB_THEMES:
            add(NB, f"Search | {theme} | {year}", f"nb_{slug(theme)}_{year}", first, last, PAID_SOURCE[NB])
    for year in YEARS:
        first, last = dt.date(year, 1, 1), dt.date(year, 12, 31)
        for term in BRAND_TERMS:
            add(BR, f"Brand | {term} | {year}", f"brand_{slug(term)}_{year}", first, last, PAID_SOURCE[BR])
    for year in YEARS:
        first, last = dt.date(year, 1, 1), dt.date(year, 12, 31)
        for audience in META_AUDIENCES:
            for objective in META_OBJECTIVES:
                add(META, f"Meta | {objective} | {audience} | {year}", f"meta_{objective}_{slug(audience)}_{year}", first, last,
                    PAID_SOURCE[META])
    for year in YEARS:
        first, last = dt.date(year, 1, 1), dt.date(year, 12, 31)
        for audience in LI_AUDIENCES:
            add(LI, f"LinkedIn | {audience} | {year}", f"li_{slug(audience)}_{year}", first, last, PAID_SOURCE[LI])
    for k, start in enumerate(YT_FLIGHTS, 1):
        first = dt.date.fromisoformat(start)
        if first.weekday() != 0:
            raise ValueError(f"YouTube flight {k} must start on a Monday")
        for creative in YT_CREATIVES:
            add(YT, f"YouTube | flight {k:02d} | {creative}", f"yt_f{k:02d}_{slug(creative)}", first,
                first + dt.timedelta(YT_FLIGHT_DAYS - 1), PAID_SOURCE[YT])
    for year in YEARS:
        first, last = dt.date(year, 1, 1), dt.date(year, 12, 31)
        for site, category in REVIEW_LISTINGS:
            add(RV, f"{site.title() if site != 'g2' else 'G2'} | {category} | {year}", f"rv_{site}_{slug(category)}_{year}",
                first, last, site)
    for year in YEARS:
        first, last = dt.date(year, 1, 1), dt.date(year, 12, 31)
        for partner in AFF_PARTNERS:
            add(AFF, f"Affiliate | {partner} | {year}", f"aff_{partner}_{year}", first, last, partner, partner)
    for i, s in enumerate(specs, 1):
        s["id"] = i
    return specs


def build_campaigns(specs: list[dict]) -> pa.Table:
    return pa.table({
        "campaign_id": pa.array([s["id"] for s in specs], pa.int32()),
        "channel_id": pa.array([CHANNELS[s["ch"]][0] for s in specs], pa.int32()),
        "campaign_name": [s["name"] for s in specs], "utm_campaign": [s["utm"] for s in specs],
        "start_date": pa.array([s["start"] for s in specs], pa.date32()),
        "end_date": pa.array([s["end"] for s in specs], pa.date32()),
    })


def build_fx(rng: np.random.Generator) -> np.ndarray:
    """05: USD/EUR monthly rates 0.86 to 0.93 (euros per dollar), a bounded walk over the 24 months."""
    rates, r = [], FX["start"]
    for i in range(24):
        if i:
            r = float(np.clip(r + rng.normal(FX["drift"], FX["step"]), FX["low"], FX["high"]))
        rates.append(round(r, 6))
    return np.array(rates)


def fx_table(rates: np.ndarray) -> pa.Table:
    return pa.table({
        "month": pa.array(MONTH_STARTS, pa.date32()), "currency": ["USD"] * 24,
        "eur_per_unit": decimal_array(np.round(rates * 1_000_000).astype(np.int64), 12, 6),
    })


# ---- ad spend ----------------------------------------------------------------------------------------------------------------

def planned_spend(specs: list[dict]) -> np.ndarray:
    """Each campaign's planned EUR a day (campaigns x days), before the weekday profile, its campaign weight and the noise:
    the channel's plan for nonbrand, brand, Meta and LinkedIn (shared out later), the campaign's own for the rest. The
    LinkedIn Q3 2025 underspend is not in the plan (the budget follows the plan)."""
    plan = np.zeros((len(specs), DAYS))
    season = SEASON[MONTH % 12]
    meta_daily = np.array([META_WEEKLY[YEAR[d]][MONTH[d] % 12] * 1000 / 7 for d in range(DAYS)])
    for k, s in enumerate(specs):
        active = np.zeros(DAYS, dtype=bool)
        active[day_index(s["start"]):day_index(s["end"]) + 1] = True
        ch = s["ch"]
        if ch == NB:
            v = np.array([NB_DAILY[y] for y in YEAR]) * season
        elif ch == BR:
            v = BRAND_DAILY * season * TREND * ~PAUSE_DAYS
        elif ch == META:
            v = meta_daily
        elif ch == LI:
            v = np.array([LI_DAILY[y] for y in YEAR])
        elif ch == YT:
            v = np.full(DAYS, YT_DAILY_PER_CAMPAIGN)
        elif ch == RV:
            v = np.full(DAYS, RV_DAILY / len(REVIEW_LISTINGS))
        else:
            v = np.array([AFF_DAILY[DEALHUB if s["partner"] == DEALHUB else "other"][y] for y in YEAR])
        plan[k] = v * active
    return plan


SHARED = (NB, BR, META, LI)                               # channels whose daily plan is shared over their campaigns


def build_ad_spend(rng: np.random.Generator, specs: list[dict], rates: np.ndarray) -> dict:
    """Spend, clicks and impressions per campaign per UTC day (E-086), and the arrays the later steps read."""
    plan = planned_spend(specs)
    ch = np.array([s["ch"] for s in specs])
    weight = lognormal(rng, 0.45, len(specs))            # a campaign's share of its channel's plan
    actual = np.zeros_like(plan)
    for c in PAID:
        rows = np.flatnonzero(ch == c)
        day_noise = lognormal(rng, SPEND_NOISE[0], DAYS) * weekday_profile(CHANNEL_WD[c])
        if c == LI:
            q3 = np.array([x.year == 2025 and 7 <= x.month <= 9 for x in DATES])
            day_noise = day_noise * np.where(q3, LI_UNDERSPEND, 1.0)          # MKT-02: LinkedIn underspends in Q3 2025
        camp_noise = lognormal(rng, SPEND_NOISE[1], (len(rows), DAYS))
        if c in SHARED:
            w = weight[rows, None] * (plan[rows] > 0)
            share = np.divide(w, w.sum(axis=0), out=np.zeros_like(w), where=w.sum(axis=0) > 0)
            actual[rows] = plan[rows].max(axis=0) * share * day_noise * camp_noise
        else:
            actual[rows] = plan[rows] * day_noise * camp_noise
    k_idx, d_idx = np.nonzero(plan > 0)
    order = np.lexsort((k_idx, d_idx))                   # by day, then campaign
    k_idx, d_idx = k_idx[order], d_idx[order]
    eur = np.maximum(np.round(actual[k_idx, d_idx] * 100), 1).astype(np.int64)
    is_li = ch[k_idx] == LI
    rate = rates[MONTH[d_idx]]
    usd = np.where(is_li, np.maximum(np.round(eur / rate), 1), 0).astype(np.int64)       # LinkedIn bills in USD (Q-03-03)
    eur = np.where(is_li, np.round(usd * rate).astype(np.int64), eur)                   # its euros at the month's rate
    cpc = np.array([CPC[c] for c in ch[k_idx]])
    ctr = np.array([CTR[c] for c in ch[k_idx]])
    impressions = np.maximum(np.round(eur / 100 / (cpc * ctr) * lognormal(rng, 0.10, len(eur))), 1).astype(np.int64)
    clicks = np.minimum(np.round(impressions * ctr * lognormal(rng, 0.12, len(eur))), impressions).astype(np.int64)
    clicks_matrix = np.zeros_like(plan)
    clicks_matrix[k_idx, d_idx] = clicks                    # a session from a campaign is a click: only days with clicks get one
    spend_matrix = np.zeros_like(plan)
    spend_matrix[k_idx, d_idx] = eur / 100
    table = pa.table({
        "spend_date": dates(d_idx), "campaign_id": pa.array([specs[k]["id"] for k in k_idx], pa.int32()),
        "impressions": pa.array(impressions, pa.int64()), "clicks": pa.array(clicks, pa.int32()),
        "spend": decimal_array(eur, 12, 2), "currency": pa.array(["EUR"] * len(eur), pa.string()),
        "export_timezone": pa.array(["UTC"] * len(eur), pa.string()),
    })
    return {"table": table, "plan": plan, "campaign": k_idx, "day": d_idx, "usd_cents": usd, "is_linkedin": is_li,
            "clicks": clicks_matrix, "spend": spend_matrix, "channel_of_campaign": ch}


# ---- the daily signup model (journeys) --------------------------------------------------------------------------------------

def weekly_response(spend: np.ndarray, alpha: float, beta: float, ec: float, slope: float) -> np.ndarray:
    """Expected signups a day: weekly geometric adstock of spend, normalised so a steady spend s gives s, then a Hill curve
    (beta at saturation, half of it at ec), shared over the week's days by each day's spend. The last, three-day week counts as
    its days' share of a full week."""
    weeks = np.arange(DAYS) // 7
    n = weeks[-1] + 1
    total = np.bincount(weeks, weights=spend, minlength=n)
    full = total * 7 / np.bincount(weeks, minlength=n)
    stock = np.empty(n)
    prev = full[0]
    for w in range(n):
        prev = (1 - alpha) * full[w] + alpha * prev
        stock[w] = prev
    response = beta * stock ** slope / (ec ** slope + stock ** slope)
    share = np.divide(spend, full[weeks], out=np.zeros(DAYS), where=full[weeks] > 0)
    return response[weeks] * share


def expected_signups(spend: dict) -> dict:
    """Each last-touch channel's expected own journeys a day, the brand demand paused, and the YouTube halo's starts."""
    season = SEASON[MONTH % 12] * TREND
    e = {}
    for c in (NB, META, LI, RV):
        beta, ec, slope = HILL[c]
        e[c] = weekly_response(spend[c], ALPHA[c], beta, ec, slope)
    e[YT] = spend[YT] / YT_LT_CPA
    e["dealhub"] = spend["dealhub"] / AFF_CPA[DEALHUB]
    e["aff_other"] = spend["aff_other"] / AFF_CPA["other"]
    brand = BASE[BR] * season * weekday_profile(SEARCH_WD)
    e[BR] = brand * ~PAUSE_DAYS
    pause = PLANTS["brand_pause"]
    for c, base in ((ORG, BASE[ORG]), (DIR, BASE[DIR]), (REF, BASE[REF])):
        e[c] = base * season * weekday_profile(UNPAID_WD)
    e[ORG] = e[ORG] + pause["to_organic"] * brand * PAUSE_DAYS        # 05: about 80% of paused brand signups recovered
    e[DIR] = e[DIR] + pause["to_direct"] * brand * PAUSE_DAYS
    e["halo"] = HALO_PER_EUR * spend[YT]
    return e


def clicked_days(spend: dict) -> dict:
    """For each journey key of a paid channel, the days its campaigns had clicks (a last touch needs one)."""
    clicks, ch, dealhub = spend["clicks"], spend["channel_of_campaign"], spend["dealhub_campaign"]
    days = {c: clicks[ch == c].sum(axis=0) > 0 for c in PAID}
    days["dealhub"] = clicks[(ch == AFF) & dealhub].sum(axis=0) > 0
    days["aff_other"] = clicks[(ch == AFF) & ~dealhub].sum(axis=0) > 0
    return days


def build_journeys(rng: np.random.Generator, spend: dict) -> dict:
    """One row per signup to be: its last-touch channel, local day, and for the YouTube halo the first touch's day. A paid
    channel's own journeys fall only on days its campaigns had clicks."""
    e = expected_signups(spend)
    for key, days in clicked_days(spend).items():
        if key in e:
            e[key] = e[key] * days
    parts = []
    for key, c, sigma in ((NB, NB, "paid"), (BR, BR, "steady"), (META, META, "paid"), (LI, LI, "paid"), (YT, YT, "paid"),
                          (RV, RV, "paid"), ("dealhub", AFF, "paid"), ("aff_other", AFF, "paid"), (ORG, ORG, "steady"),
                          (DIR, DIR, "steady"), (REF, REF, "steady")):
        n = draw_counts(rng, e[key], COUNT_NOISE[sigma])
        day = np.repeat(np.arange(DAYS), n)
        parts.append((np.full(len(day), c), day, np.full(len(day), -1), np.full(len(day), key == "dealhub")))
    # The YouTube halo: journeys started on a flight day close k weeks later (k = 1 to 8, weight 0.7 ** (k - 1)), give or take
    # three days, through brand search, organic or direct. A brand close that falls in the pause goes to organic or direct
    # (80%) or is lost, as brand demand does.
    n = draw_counts(rng, e["halo"], COUNT_NOISE["steady"])
    start = np.repeat(np.arange(DAYS), n)
    k = np.arange(1, HALO_KERNEL_WEEKS + 1)
    kernel = ALPHA[YT] ** (k - 1)
    weeks = rng.choice(k, size=len(start), p=kernel / kernel.sum())
    day = start + 7 * weeks + rng.integers(-3, 4, len(start))
    lt = np.array([c for c, _ in HALO_LT])[pick(rng, HALO_LT, len(start))]
    pause = PLANTS["brand_pause"]
    u = rng.random(len(start))
    inside = day < DAYS
    paused = inside & (lt == BR) & PAUSE_DAYS[np.minimum(day, DAYS - 1)]
    lt = np.where(paused & (u < pause["to_organic"]), ORG, lt)
    lt = np.where(paused & (u >= pause["to_organic"]) & (u < pause["organic_recovery"]), DIR, lt)
    keep = inside & ~(paused & (u >= pause["organic_recovery"]))
    parts.append((lt[keep], day[keep], start[keep], np.zeros(int(keep.sum()), dtype=bool)))
    lt, day, ft_day, dealhub = (np.concatenate(x) for x in zip(*parts))
    return {"lt": lt.astype(np.int64), "day": day.astype(np.int64), "ft_day": ft_day.astype(np.int64), "dealhub": dealhub,
            "halo": ft_day >= 0, "expected": e}


# ---- signups --------------------------------------------------------------------------------------------------------------

def local_to_utc(local_seconds: np.ndarray, zones: np.ndarray) -> np.ndarray:
    """Seconds since 1970 of each local wall-clock time in its time zone (DuckDB's built-in ICU; ruling R17)."""
    con = duckdb.connect(config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    try:
        con.register("t", pa.table({"i": np.arange(len(zones)), "local": pa.array(local_seconds * 1_000_000, pa.timestamp("us")),
                                    "zone": pa.array(zones, pa.string())}))
        got = con.execute("SELECT i, epoch(timezone(zone, local)) AS s FROM t ORDER BY i").fetchnumpy()
    finally:
        con.close()
    return np.round(np.asarray(got["s"], dtype=float)).astype(np.int64)


def build_signups(rng: np.random.Generator, journeys: dict) -> dict:
    """Each journey's signup: country, local time (FIND-03-14), UTC instant and email domain (FIND-03-08)."""
    lt, day = journeys["lt"], journeys["day"]
    n = len(lt)
    codes = sorted(COUNTRIES)
    country = rng.choice(len(codes), size=n, p=np.array([COUNTRY_MIX[c] for c in codes]))
    hours = np.empty(n, dtype=np.int64)
    meta = lt == META
    for mask, profile in ((meta, META_HOURS), (~meta, BUSINESS_HOURS)):
        p = np.array(profile) / sum(profile)
        hours[mask] = rng.choice(24, size=int(mask.sum()), p=p)
    early = ((lt == BR) | (lt == YT) | (lt == RV) | (day == 0)) & (hours < EARLIEST_HOUR)   # their UTC day is the local day
    late = np.array(BUSINESS_HOURS[EARLIEST_HOUR:]) / sum(BUSINESS_HOURS[EARLIEST_HOUR:])
    hours[early] = EARLIEST_HOUR + rng.choice(24 - EARLIEST_HOUR, size=int(early.sum()), p=late)
    seconds = rng.integers(0, 3600, n)
    local = (DAY0 + day) * 86400 + hours * 3600 + seconds
    utc = local_to_utc(local, np.array([COUNTRIES[codes[i]] for i in country]))
    # Email domains: dealhub's mostly disposable (05: 60%), a few elsewhere; free mail; the rest a small business's own domain.
    u = rng.random(n)
    disposable = np.where(journeys["dealhub"], u < PLANTS["dealhub"]["disposable_share"], u < DISPOSABLE_SHARE)
    free = ~disposable & (rng.random(n) < FREE_SHARE)
    local_mail = rng.random(n) < 0.3
    a = rng.integers(0, len(BUSINESS_WORDS[0]), n)
    b = rng.integers(0, len(BUSINESS_WORDS[1]), n)
    which_free = rng.integers(0, len(FREE_MAIL), n)
    which_disposable = rng.integers(0, len(DISPOSABLE_DOMAINS), n)
    domains = []
    for i in range(n):
        code = codes[country[i]]
        if disposable[i]:
            domains.append(DISPOSABLE_DOMAINS[which_disposable[i]])
        elif free[i]:
            domains.append(LOCAL_MAIL[code] if local_mail[i] else FREE_MAIL[which_free[i]])
        else:
            domains.append(f"{BUSINESS_WORDS[0][a[i]]}{BUSINESS_WORDS[1][b[i]]}.{code.lower()}")
    order = np.lexsort((np.arange(n), utc))              # user_id follows signup_ts
    return {"order": order, "utc": utc, "country": country, "domain": np.array(domains, dtype=object)}


# ---- sessions -------------------------------------------------------------------------------------------------------------

def choose(options, u: float):
    total, acc = sum(w for _, w in options), 0.0
    for value, w in options:
        acc += w / total
        if u < acc:
            return value
    return options[-1][0]


ANY_GROUP, DEALHUB_GROUP, OTHER_AFF_GROUP = 0, 1, 2      # which affiliate campaigns a session may click


def build_paths(rng: np.random.Generator, journeys: dict, signups: dict, active: np.ndarray) -> dict:
    """Each signup's sessions: its path before the signup (P34: on different UTC days, so first and last touch are unique;
    the last touch minutes before the signup) and its sessions after it. Returns one row per session, by signup order."""
    order = signups["order"]
    lt = journeys["lt"][order]
    halo = journeys["halo"][order]
    ft_halo = journeys["ft_day"][order]
    dealhub = journeys["dealhub"][order]
    utc = signups["utc"][order]
    n = len(order)
    su = utc // 86400 - DAY0                              # the signup's UTC day
    u_multi, u_ft, u_len, u_post, u_post_n = (rng.random(n) for _ in range(5))
    lag = rng.integers(*FIRST_TOUCH_LAG, n)
    u_mid = rng.random((n, 3))
    u_mid_ch = rng.random((n, 3))
    earlier = rng.integers(*EARLIER_LAG, (n, 2))
    post_days = rng.integers(*AFTER_SIGNUP["days"], (n, 3))
    u_post_ch = rng.random((n, 3))
    lt_offset = rng.integers(120, 1801, n)
    rows_user, rows_ch, rows_day, rows_role, rows_group = [], [], [], [], []

    def add(i, c, d, role):
        rows_user.append(i)
        rows_ch.append(c)
        rows_day.append(d)
        rows_role.append(role)
        rows_group.append((DEALHUB_GROUP if dealhub[i] else OTHER_AFF_GROUP) if c == AFF else ANY_GROUP)

    for i in range(n):
        c, day = int(lt[i]), int(su[i])
        before = []                                       # (channel, day) of the sessions before the last touch
        if halo[i] or (u_multi[i] < MULTI[c] * (0.5 if dealhub[i] else 1.0)):
            if halo[i]:
                first, first_day = YT, int(ft_halo[i])
            else:
                first, first_day = choose(FIRST_TOUCH[c], u_ft[i]), day - int(lag[i])
            if first_day >= 0 and first_day < day and (first not in PAID or active[first, first_day]):
                before.append((first, first_day))
                length = choose(MULTI_LENGTH, u_len[i])
                room = day - first_day - 1
                for m in range(min(length - 2, room)):
                    d = first_day + 1 + int(u_mid[i, m] * room)
                    pool = ((first, 0.4), (c, 0.4), (ORG, 0.1), (DIR, 0.1))
                    mc = choose(pool, u_mid_ch[i, m])
                    if mc in PAID and not active[mc, d]:
                        mc = ORG
                    before.append((mc, d))
        if not before:
            length = 1 if c == YT else choose(SINGLE_LENGTH, u_len[i])
            for m in range(length - 1):
                d = day - int(earlier[i, m])
                if d >= 0 and (c not in PAID or active[c, d]):
                    before.append((c, d))
        seen = set()
        for ch_, d in sorted(before, key=lambda x: x[1]):
            if d not in seen and d < day:
                seen.add(d)
                add(i, ch_, d, 0)
        add(i, c, day, 1)                                 # the last touch, minutes before the signup
        if u_post[i] < AFTER_SIGNUP["share"]:
            k = choose(AFTER_SIGNUP["count"], u_post_n[i])
            for j, d in enumerate(sorted({day + int(x) for x in post_days[i, :k]})):
                if d < DAYS:
                    add(i, choose(AFTER_SIGNUP["channels"], u_post_ch[i, j]), d, 2)
    user = np.array(rows_user, dtype=np.int64)
    role = np.array(rows_role, dtype=np.int64)
    start = np.zeros(len(user), dtype=np.int64)
    last = role == 1
    since_midnight = utc[user[last]] % 86400
    start[last] = utc[user[last]] - np.minimum(lt_offset[user[last]], since_midnight)
    return {"user": user, "channel": np.array(rows_ch, dtype=np.int64), "day": np.array(rows_day, dtype=np.int64),
            "role": role, "group": np.array(rows_group, dtype=np.int64), "start": start}


def hour_seconds(rng: np.random.Generator, channel: np.ndarray) -> np.ndarray:
    """Seconds into a UTC day for sessions: the local hour profiles one hour earlier (most visitors are on UTC+1)."""
    out = np.empty(len(channel), dtype=np.int64)
    meta = channel == META
    for mask, profile in ((meta, META_HOURS), (~meta, BUSINESS_HOURS)):
        p = np.roll(np.array(profile), -1)
        out[mask] = rng.choice(24, size=int(mask.sum()), p=p / p.sum()) * 3600 + rng.integers(0, 3600, int(mask.sum()))
    return out


def build_sessions(rng: np.random.Generator, journeys: dict, signups: dict, spend: dict, specs: list[dict]) -> dict:
    """All clean sessions (05 CO-03: about 2,000,000): the signups' paths, then non-converting visitors per channel, each
    session with its campaign (paid), source, medium, landing page, device and country."""
    clicks = spend["clicks"]
    camp_ch = spend["channel_of_campaign"]
    active = np.zeros((10, DAYS), dtype=bool)
    for c in PAID:
        active[c] = clicks[camp_ch == c].sum(axis=0) > 0
    path = build_paths(rng, journeys, signups, active)
    n_users = len(signups["order"])
    early = path["role"] != 1
    path["start"][early] = (DAY0 + path["day"][early]) * 86400 + hour_seconds(rng, path["channel"][early])
    # Non-converting visitors: each channel's sessions make up its share of the total, on days weighted by its clicks (paid)
    # or by its traffic (unpaid); a visitor's later sessions follow 1 to 10 days apart, in the same channel.
    traffic = SEASON[MONTH % 12] * TREND * weekday_profile(UNPAID_WD)
    conv = np.bincount(path["channel"], minlength=10)
    v_ch, v_day, v_user = [], [], []
    next_user = n_users
    for c in sorted(SESSION_SHARE):
        target = SESSION_SHARE[c] * SESSIONS_TOTAL - conv[c]
        weight = clicks[camp_ch == c].sum(axis=0) if c in PAID else traffic
        sizes = rng.geometric(VISITOR_GEOMETRIC, size=int(max(target, 0) * VISITOR_GEOMETRIC))   # mean 1 / p sessions each
        first = rng.choice(DAYS, size=len(sizes), p=weight / weight.sum())
        owner = np.repeat(np.arange(len(sizes)), sizes)
        step = np.where(np.arange(len(owner)) == np.searchsorted(owner, owner), 0, rng.integers(*VISITOR_GAP, len(owner)))
        day = first[owner] + _cumsum_by_group(step, owner)
        keep = (day < DAYS) & (active[c, np.minimum(day, DAYS - 1)] if c in PAID else True)
        v_ch.append(np.full(int(keep.sum()), c))
        v_day.append(day[keep])
        v_user.append(next_user + owner[keep])
        next_user += len(sizes)
    v_ch, v_day, v_user = np.concatenate(v_ch), np.concatenate(v_day), np.concatenate(v_user)
    v_start = (DAY0 + v_day) * 86400 + hour_seconds(rng, v_ch)
    channel = np.concatenate([path["channel"], v_ch])
    day = np.concatenate([path["day"], v_day])
    visitor = np.concatenate([path["user"], v_user])
    start = np.concatenate([path["start"], v_start])
    group = np.concatenate([path["group"], np.full(len(v_ch), ANY_GROUP)])
    total_visitors = next_user
    # The campaign of each paid session: one with a spend row on that UTC day, weighted by its clicks that day. A signup that
    # dealhub sent clicked dealhub's campaign, and one another affiliate sent clicked another's.
    campaign = np.full(len(channel), -1, dtype=np.int64)
    partner = np.array([s["partner"] == DEALHUB for s in specs])
    allowed = {ANY_GROUP: np.ones(len(specs), dtype=bool), DEALHUB_GROUP: partner, OTHER_AFF_GROUP: ~partner}
    paid_rows = np.flatnonzero(np.isin(channel, PAID))
    key = np.lexsort((paid_rows, day[paid_rows], group[paid_rows], channel[paid_rows]))
    paid_rows = paid_rows[key]
    groups = np.stack([channel[paid_rows], group[paid_rows], day[paid_rows]], axis=1)
    cuts = np.flatnonzero(np.any(np.diff(groups, axis=0) != 0, axis=1)) + 1
    for block in np.split(paid_rows, cuts):
        c, g, d = int(channel[block[0]]), int(group[block[0]]), int(day[block[0]])
        cand = np.flatnonzero((camp_ch == c) & (clicks[:, d] > 0) & allowed[g])
        w = clicks[cand, d]
        campaign[block] = cand[rng.choice(len(cand), size=len(block), p=w / w.sum())]
    # Visitors' countries: a signup's is its own; any other visitor's from the mix.
    codes = sorted(COUNTRIES)
    v_country = np.empty(total_visitors, dtype=np.int64)
    v_country[:n_users] = signups["country"][signups["order"]]
    v_country[n_users:] = rng.choice(len(codes), size=total_visitors - n_users, p=np.array([COUNTRY_MIX[c] for c in codes]))
    number = rng.permutation(total_visitors) + 1          # visitor_id numbers carry no order
    # Source, medium, landing page and device.
    m = len(channel)
    source = np.full(m, -1, dtype=np.int64)
    medium = np.full(m, -1, dtype=np.int64)
    sources = sorted({s["source"] for s in specs} | {s for s, _ in ORGANIC_SOURCES} | set(REFERRERS))
    s_index = {s: i for i, s in enumerate(sources)}
    mediums = sorted(set(PAID_MEDIUM.values()) | {"organic", "referral"})
    m_index = {x: i for i, x in enumerate(mediums)}
    paid = campaign >= 0
    camp_source = np.array([s_index[s["source"]] for s in specs])
    source[paid] = camp_source[campaign[paid]]
    medium[paid] = np.array([m_index[PAID_MEDIUM[c]] for c in range(7)])[channel[paid]]
    org = channel == ORG
    source[org] = np.array([s_index[s] for s, _ in ORGANIC_SOURCES])[pick(rng, ORGANIC_SOURCES, int(org.sum()))]
    medium[org] = m_index["organic"]
    ref = channel == REF
    source[ref] = np.array([s_index[s] for s in REFERRERS])[rng.integers(0, len(REFERRERS), int(ref.sum()))]
    medium[ref] = m_index["referral"]
    pages = sorted({p for opts in LANDING.values() for p, _ in opts})
    p_index = {p: i for i, p in enumerate(pages)}
    landing = np.empty(m, dtype=np.int64)
    device = np.empty(m, dtype=np.int64)
    for c in range(10):
        mask = channel == c
        landing[mask] = np.array([p_index[p] for p, _ in LANDING[c]])[pick(rng, LANDING[c], int(mask.sum()))]
        device[mask] = rng.choice(3, size=int(mask.sum()), p=np.array(DEVICE_MIX.get(c, DEVICE_DEFAULT)))
    order = np.lexsort((number[visitor], start))         # session_id follows session_start
    names = np.array([f"V{x:07d}" for x in range(total_visitors + 1)], dtype=object)
    table = pa.table({
        "session_id": pa.array(np.arange(1, m + 1), pa.int64()),
        "visitor_id": pa.array(names[number[visitor[order]]], pa.string()),
        "session_start": timestamps(start[order]),
        "utm_source": strings(sources, np.maximum(source[order], 0), source[order] < 0),
        "utm_medium": strings(mediums, np.maximum(medium[order], 0), medium[order] < 0),
        "utm_campaign": strings([s["utm"] for s in specs], np.maximum(campaign[order], 0), campaign[order] < 0),
        "landing_page": strings(pages, landing[order]),
        "device": strings(DEVICES, device[order]),
        "country_code": strings(codes, v_country[visitor[order]]),
    })
    user_visitor = names[number[np.arange(n_users)]]     # signup order's visitor_id
    return {"table": table, "channel": channel[order], "user_visitor": user_visitor, "visitors": total_visitors,
            "next_visitor_number": total_visitors + 1}


def _cumsum_by_group(step: np.ndarray, owner: np.ndarray) -> np.ndarray:
    """Running sums of `step` restarting at each new owner (owners are sorted)."""
    total = np.cumsum(step)
    first = np.searchsorted(owner, owner)
    return total - total[first] + step[first]


# ---- activation, subscriptions, payments ----------------------------------------------------------------------------------

def build_activation(rng: np.random.Generator, lt: np.ndarray, dealhub: np.ndarray, utc: np.ndarray) -> dict:
    """05 CO-03: activation 45% (dealhub 5%). An activated user's first event is first_campaign_sent; more events follow."""
    n = len(lt)
    rate = np.where(dealhub, DEALHUB_FUNNEL["activation"], np.array([ACTIVATION[c] for c in range(10)])[lt])
    median, sigma, cap = ACTIVATION_DELAY_HOURS
    delay = np.minimum(np.exp(np.log(median) + sigma * rng.standard_normal(n)), cap)
    first = utc + np.round(delay * 3600).astype(np.int64)
    end = (DAY0 + DAYS) * 86400 - 1
    activated = (rng.random(n) < rate) & (first <= end)
    extra = rng.poisson(EXTRA_EVENTS, n) * activated
    owner = np.repeat(np.arange(n), extra)
    ts = first[owner] + rng.integers(1800, EVENT_SPAN_DAYS * 86400, len(owner))
    names = np.array([x for x, _ in EVENT_MIX])[pick(rng, EVENT_MIX, len(owner))]
    keep = ts <= end
    users = np.concatenate([np.flatnonzero(activated), owner[keep]])
    times = np.concatenate([first[activated], ts[keep]])
    labels = np.concatenate([np.full(int(activated.sum()), "first_campaign_sent", dtype=object), names[keep].astype(object)])
    order = np.lexsort((labels.astype(str), times, users))
    return {"activated": activated, "first": first, "user": users[order], "ts": times[order], "name": labels[order]}


def build_subscriptions(rng: np.random.Generator, lt: np.ndarray, dealhub: np.ndarray, activation: dict) -> list[tuple]:
    """Activated users pay at 05's 20%; a subscription runs month by month until it churns (5%, Meta x1.4) or changes plan,
    which ends it and starts the next; a churned user may come back. Returns (user, plan, start, end or None)."""
    n = len(lt)
    rate = np.where(dealhub, DEALHUB_FUNNEL["to_paid"], np.array([TO_PAID[c] for c in range(10)])[lt])
    mean, low, cap = PAID_DELAY_DAYS
    payer = activation["activated"] & (rng.random(n) < rate)
    out = []
    for i in np.flatnonzero(payer):
        first_day = int(activation["first"][i] // 86400) - DAY0
        start = WINDOW_START + dt.timedelta(first_day + int(min(max(rng.exponential(mean), low), cap)))
        mix = DEALHUB_FUNNEL["plan_mix"] if dealhub[i] else PLAN_MIX[int(lt[i])]
        churn = CHURN * (DEALHUB_FUNNEL["churn"] if dealhub[i] else META_CHURN if lt[i] == META else 1.0)
        plan = int(rng.choice(3, p=np.array(mix)))
        while start <= WINDOW_END:
            k = 1
            while True:
                renewal = add_months(start, k)
                if renewal > WINDOW_END:
                    out.append((int(i), plan, start, None))
                    start = WINDOW_END + dt.timedelta(1)
                    break
                u = rng.random()
                if u < churn:
                    out.append((int(i), plan, start, renewal - dt.timedelta(1)))
                    if rng.random() < RESUBSCRIBE["share"]:
                        start = renewal + dt.timedelta(int(rng.integers(*RESUBSCRIBE["days"])))
                        plan = int(rng.choice(3, p=np.array(mix)))
                    else:
                        start = WINDOW_END + dt.timedelta(1)
                    break
                if u < churn + PLAN_CHANGE:
                    up = rng.random() < UPGRADE_SHARE
                    new = min(plan + 1, 2) if up else max(plan - 1, 0)
                    if new != plan:
                        out.append((int(i), plan, start, renewal - dt.timedelta(1)))
                        plan, start = new, renewal
                        break
                k += 1
    return out


def build_payments(rng: np.random.Generator, subs: list[tuple]) -> dict:
    """A subscription's monthly fee on its start date and each month after, inside the window; 4% refunded (05 Q-03-07)."""
    sub_ids, days = [], []
    for sid, (_, _, start, end) in enumerate(subs, 1):
        last = min(end or WINDOW_END, WINDOW_END)
        k = 0
        while (d := add_months(start, k)) <= last:
            sub_ids.append(sid)
            days.append((d - WINDOW_START).days)
            k += 1
    sub_ids = np.array(sub_ids, dtype=np.int64)
    days = np.array(days, dtype=np.int64)
    at = (DAY0 + days) * 86400 + rng.integers(BILLING_HOURS[0] * 3600, BILLING_HOURS[1] * 3600, len(days))
    refunded = rng.random(len(days)) < REFUND_SHARE
    order = np.lexsort((sub_ids, at))
    return {"subscription": sub_ids[order], "at": at[order], "refunded": refunded[order]}


# ---- budget and countries (S6-20) -------------------------------------------------------------------------------------------

def build_budget_monthly(rng: np.random.Generator, specs: list[dict], plan: np.ndarray) -> pa.Table:
    """MKT-02: each paid channel's planned spend per month, 2024-01 to 2025-12, from the spend plan (weekday profile included)
    with a little noise, in whole euros. Meta's Q3 2025 budget stays at a lower weekly level than it spent (an overspend);
    LinkedIn's follows its plan, which it underspent in Q3 2025 (build_ad_spend)."""
    ch = np.array([s["ch"] for s in specs])
    months, channels, budget = [], [], []
    for c in PAID:
        profile = weekday_profile(CHANNEL_WD[c])
        if c in SHARED:
            daily = plan[ch == c].max(axis=0) * profile
        else:
            daily = plan[ch == c].sum(axis=0) * profile
        if c == META:
            q3 = np.array([x.year == 2025 and 7 <= x.month <= 9 for x in DATES])
            daily = np.where(q3, META_Q3_BUDGET_WEEKLY / 7 * profile, daily)
        for m in range(24):
            total = daily[MONTH == m].sum() * (1 + rng.normal(0, 0.015))
            months.append(MONTH_STARTS[m])
            channels.append(CHANNELS[c][0])
            budget.append(int(round(max(total, 0))) * 100)
    order = np.lexsort((np.array(channels), np.array([x.toordinal() for x in months])))
    return pa.table({
        "month": pa.array([months[i] for i in order], pa.date32()),
        "channel_id": pa.array([channels[i] for i in order], pa.int32()),
        "budget_eur": decimal_array(np.array(budget, dtype=np.int64)[order], 12, 2),
    })


def build_countries() -> pa.Table:
    codes = sorted(COUNTRIES)
    return pa.table({"country_code": codes, "timezone": [COUNTRIES[c] for c in codes]})


# ---- generate ----------------------------------------------------------------------------------------------------------------

def generate(seed: int = SEED) -> tuple[dict, dict]:
    r = rngs(seed)
    specs = campaign_specs()
    rates = build_fx(r["fx_rates_monthly"])
    ad = build_ad_spend(r["ad_spend_daily"], specs, rates)
    ch = ad["channel_of_campaign"]
    spend = {c: ad["spend"][ch == c].sum(axis=0) for c in PAID}
    partner = np.array([s["partner"] == DEALHUB for s in specs])
    spend["dealhub"] = ad["spend"][(ch == AFF) & partner].sum(axis=0)
    spend["aff_other"] = ad["spend"][(ch == AFF) & ~partner].sum(axis=0)
    spend["clicks"], spend["channel_of_campaign"], spend["dealhub_campaign"] = ad["clicks"], ch, partner
    journeys = build_journeys(r["daily_signups_model"], spend)
    signups = build_signups(r["signups"], journeys)
    sessions = build_sessions(r["sessions"], journeys, signups, spend, specs)
    order = signups["order"]
    lt, dealhub, utc = journeys["lt"][order], journeys["dealhub"][order], signups["utc"][order]
    activation = build_activation(r["activation_events"], lt, dealhub, utc)
    subs = sorted(build_subscriptions(r["subscriptions"], lt, dealhub, activation), key=lambda s: (s[2], s[0]))
    pays = build_payments(r["payments"], subs)
    codes = sorted(COUNTRIES)
    n = len(order)
    clean = {
        "channels": build_channels(),
        "campaigns": build_campaigns(specs),
        "ad_spend_daily": ad["table"],
        "fx_rates_monthly": fx_table(rates),
        "sessions": sessions["table"],
        "signups": pa.table({
            "user_id": pa.array(np.arange(1, n + 1), pa.int64()),
            "visitor_id": pa.array(sessions["user_visitor"], pa.string()),
            "signup_ts": timestamps(utc),
            "country_code": strings(codes, signups["country"][order]),
            "email_domain": pa.array(signups["domain"][order].tolist(), pa.string()),
        }),
        "activation_events": pa.table({
            "user_id": pa.array(activation["user"] + 1, pa.int64()), "event_ts": timestamps(activation["ts"]),
            "event_name": pa.array(activation["name"].tolist(), pa.string()),
        }),
        "subscriptions": pa.table({
            "subscription_id": pa.array(np.arange(1, len(subs) + 1), pa.int64()),
            "user_id": pa.array([s[0] + 1 for s in subs], pa.int64()),
            "plan_name": pa.array([PLANS[s[1]][0] for s in subs], pa.string()),
            "start_date": pa.array([s[2] for s in subs], pa.date32()),
            "end_date": pa.array([s[3] for s in subs], pa.date32()),
            "monthly_price_eur": decimal_array(np.array([PLANS[s[1]][1] * 100 for s in subs], dtype=np.int64), 8, 2),
        }),
    }
    price = np.array([PLANS[s[1]][1] * 100 for s in subs], dtype=np.int64)
    clean["payments"] = pa.table({
        "payment_id": pa.array(np.arange(1, len(pays["at"]) + 1), pa.int64()),
        "subscription_id": pa.array(pays["subscription"], pa.int64()),
        "paid_at": timestamps(pays["at"]),
        "amount_eur": decimal_array(price[pays["subscription"] - 1], 10, 2),
        "refunded": pa.array(pays["refunded"], pa.bool_()),
    })
    clean["budget_monthly"] = build_budget_monthly(r["budget_monthly"], specs, ad["plan"])
    clean["countries"] = build_countries()
    clean = {name: clean[name] for name in CLEAN_TABLES}
    from . import raw as mv_raw                           # raw.py imports this module, so it is imported when generate() runs
    raw, planted_raw = mv_raw.inject_quirks(r["quirks"], clean, ad, sessions["channel"], sessions["next_visitor_number"])
    truth = {
        "company": "mailvora", "seed": seed, "as_of_date": AS_OF_DATE,
        "channels": {CHANNELS[c][1]: {"channel_id": CHANNELS[c][0], "channel_group": CHANNELS[c][2],
                                      "cost_model": CHANNELS[c][3]} for c in range(10)},
        "definitions": DEFINITIONS,
        "planted": {
            **PLANTS,
            "budget_monthly": {"overspend": {"channel": "meta", "quarter": "2025-Q3",
                                             "weekly_budget_eur": META_Q3_BUDGET_WEEKLY},
                               "underspend": {"channel": "linkedin", "quarter": "2025-Q3", "spend_share_of_plan": LI_UNDERSPEND}},
            "funnel": {"activation": {NAMES[c]: ACTIVATION[c] for c in range(10)},
                       "to_paid": {NAMES[c]: TO_PAID[c] for c in range(10)}, "dealhub": DEALHUB_FUNNEL,
                       "churn": CHURN, "meta_churn_multiplier": META_CHURN},
            "disposable_domains": list(DISPOSABLE_DOMAINS),
            "raw": dict(sorted(planted_raw.items())),
        },
    }
    return {"clean": clean, "raw": raw}, truth


# ---- validation (GEN-01, GEN-06 as OD-GEN-01 and E-093 amend it) ------------------------------------------------------------

DEFINITIONS = {
    "channel": "Each session's channel by the E-196 rule (the notes of mailvora.sessions); a signup's first and last touch are "
               "the channels of its visitor's first and last session at or before signup_ts.",
    "FIND-03-01": "2025 spend (clean, EUR) of meta plus nonbrand_search over all 2025 spend.",
    "FIND-03-02": "Per channel over the window: CPC = sum(spend) / NULLIF(sum(clicks), 0); CTR = sum(clicks) / sum(impressions).",
    "FIND-03-03": "Activated: a signup with an activation event (its first is first_campaign_sent). Paid: an activated signup with "
                  "a subscription (E-012's cumulative rule). Rates over all signups; by last-touch channel for the pattern.",
    "FIND-03-04": "Review sites, last touch, signups before 2025-10-01: non-refunded payments within 90 days of signup over "
                  "review sites' spend before 2025-10-01 (ROAS); review sites' last-touch signups over all last-touch signups "
                  "of paid channels (channel_group other than unpaid). Paid signups means signups whose last touch is a paid "
                  "channel, not paying users.",
    "FIND-03-05": "Monday weeks 2024-01-01 to 2025-12-22: Meta's weekly spend and its last-touch signups by signup week. "
                  "Marginal CPA = 1 / regr_slope(signups, spend) over the weeks below 18,000 EUR and over those at or above it; "
                  "the ratio is above over below. 05's reveal method (2,000 EUR buckets with LAG deltas) is noisy at this "
                  "volume: use per-regime slopes, as here, or bucket medians.",
    "FIND-03-06": "Those 104 weeks, zero-filled: CORR(organic plus direct last-touch signups, YouTube spend k weeks earlier), "
                  "k = 0 to 4.",
    "FIND-03-07": "Last-touch signups by UTC day: brand_search and organic plus direct, in 2025-04-07 to 05-04 (before) and "
                  "2025-05-05 to 06-01 (during). Recovery = (organic plus direct during - before) / (brand before - during).",
    "FIND-03-08": "Signups whose last touch's utm_campaign names dealhub: their activation rate, and the share whose "
                  "email_domain is in disposable_domains.",
    "FIND-03-09": "Payers whose first payment is before 2025-07-01: non-refunded payments within 180 days of the first, per "
                  "payer, by last-touch channel (channels with 30 or more payers).",
    "FIND-03-10": "Channel spend over the window divided by its first-touch signups, and by its last-touch signups; the gap "
                  "is abs(first-touch CAC / last-touch CAC - 1).",
    "FIND-03-11": "On mailvora_raw alone (P37): its signups, and each one's last session before signup_ts mapped by the "
                  "channel rule. CPA: a day's LinkedIn spend over that UTC day's LinkedIn last-touch signups, summed over the "
                  "Mondays and over the other days; the ratio is Monday CPA over other-days CPA. Raw: by raw spend_date. Fixed: "
                  "by spend_date plus one day (the rule in mailvora_raw's notes). Days 2024-01-01 to 2025-12-31. Also by each "
                  "weekday (its spend summed over its signups summed): on raw, Monday has the highest weekday CPA; after the "
                  "rule, every weekday's CPA is within 0.9 to 1.1 of the pooled CPA.",
    "FIND-03-12": "Raw sessions: distinct utm_source of Meta campaigns' sessions; the share of all raw sessions whose "
                  "lower(trim(utm_source)) is facebook, fb, meta or ig (mapped), or exactly 'facebook' (naive).",
    "FIND-03-13": "Raw LinkedIn rows: sum(spend * eur_per_unit of the month of spend_date plus one day) over sum(spend).",
    "FIND-03-14": "Signups in local time (signup_ts AT TIME ZONE countries.timezone): modal dayofweek (Sunday 0) and hour; "
                  "weekend (dayofweek 0 or 6) shares overall and for last-touch meta.",
    "FIND-03-15": "Paying users (a payment on a subscription): the share whose sessions before signup span 2 or more channels; "
                  "the modal path, string_agg(channel, ' > ' ORDER BY session_start), among those.",
}
FULL_WEEKS = ("2024-01-01", "2025-12-22")
SATURATION_EUR_WEEK = PLANTS["meta_saturation"]["threshold_eur_week"]

ATTRIBUTION_SQL = """
CREATE TEMP TABLE session_channel AS
SELECT s.session_id, s.visitor_id, s.session_start, s.utm_campaign,
       CASE WHEN s.utm_campaign IS NOT NULL THEN ch.channel_name
            WHEN s.utm_medium = 'organic' THEN 'organic'
            WHEN s.utm_medium = 'referral' THEN 'referral'
            WHEN s.utm_source IS NULL AND s.utm_medium IS NULL THEN 'direct' END AS channel
FROM c_sessions s LEFT JOIN c_campaigns c ON c.utm_campaign = s.utm_campaign LEFT JOIN c_channels ch ON ch.channel_id = c.channel_id;
CREATE TEMP TABLE attribution AS
WITH t AS (SELECT u.user_id, u.signup_ts, sc.channel, sc.session_start, sc.utm_campaign
           FROM c_signups u JOIN session_channel sc ON sc.visitor_id = u.visitor_id AND sc.session_start <= u.signup_ts)
SELECT user_id, any_value(signup_ts) AS signup_ts, arg_min(channel, session_start) AS ft, arg_max(channel, session_start) AS lt,
       arg_max_null(utm_campaign, session_start) AS lt_campaign, count(DISTINCT channel) AS channels,
       string_agg(channel, ' > ' ORDER BY session_start) AS path
FROM t GROUP BY user_id;
CREATE TEMP VIEW c_spend AS SELECT a.*, ch.channel_name FROM c_ad_spend_daily a JOIN c_campaigns c USING (campaign_id)
JOIN c_channels ch USING (channel_id);
CREATE TEMP VIEW r_spend AS SELECT a.*, ch.channel_name FROM r_ad_spend_daily a JOIN r_campaigns c USING (campaign_id)
JOIN r_channels ch USING (channel_id);
CREATE TEMP TABLE r_last_touch AS
WITH sc AS (SELECT s.visitor_id, s.session_start,
                   CASE WHEN s.utm_campaign IS NOT NULL THEN ch.channel_name
                        WHEN s.utm_medium = 'organic' THEN 'organic'
                        WHEN s.utm_medium = 'referral' THEN 'referral'
                        WHEN s.utm_source IS NULL AND s.utm_medium IS NULL THEN 'direct' END AS channel
            FROM r_sessions s LEFT JOIN r_campaigns c ON c.utm_campaign = s.utm_campaign LEFT JOIN r_channels ch ON ch.channel_id = c.channel_id)
SELECT u.user_id, any_value(u.signup_ts) AS signup_ts, arg_max_null(sc.channel, sc.session_start) AS lt
FROM r_signups u JOIN sc ON sc.visitor_id = u.visitor_id AND sc.session_start <= u.signup_ts GROUP BY u.user_id;
CREATE TEMP TABLE activated AS SELECT DISTINCT user_id FROM c_activation_events;
CREATE TEMP TABLE payers AS SELECT DISTINCT s.user_id FROM c_subscriptions s JOIN c_payments p USING (subscription_id);
"""


def _check(ok: bool, message: str) -> None:
    if not ok:
        raise ValueError(message)


def measure(tables: dict) -> dict:
    """Every finding's measures, computed in SQL: the clean tables for findings not about cleaning (OD-GEN-01, E-093), raw for
    FIND-03-11 to -13 (FIND-03-11 on mailvora_raw alone, with its copy of signups: P37)."""
    con = duckdb.connect(config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    try:
        for prefix, source in (("c", tables["clean"]), ("r", tables["raw"])):
            for name, table in source.items():
                con.register(f"{prefix}_{name}", table)
        con.execute(ATTRIBUTION_SQL)

        def one(sql):
            return con.execute(sql).fetchone()

        def rows(sql):
            return con.execute(sql).fetchall()

        m: dict = {}
        m["FIND-03-01"] = {"share": round(float(one("""SELECT sum(spend) FILTER (WHERE channel_name IN ('meta', 'nonbrand_search'))
            / sum(spend) FROM c_spend WHERE year(spend_date) = 2025""")[0]), 4)}
        cpc = {k: round(float(v), 4) for k, v in rows("SELECT channel_name, sum(spend) / NULLIF(sum(clicks), 0) FROM c_spend GROUP BY 1")}
        ctr = {k: round(float(v), 6) for k, v in rows("SELECT channel_name, sum(clicks) / sum(impressions) FROM c_spend GROUP BY 1")}
        m["FIND-03-02"] = {"top_cpc": max(cpc, key=cpc.get), "top_ctr": max(ctr, key=ctr.get), "cpc": dict(sorted(cpc.items())),
                           "ctr": dict(sorted(ctr.items()))}
        signups, act, paid = one("""SELECT count(*), count(*) FILTER (WHERE a.user_id IS NOT NULL),
                count(*) FILTER (WHERE a.user_id IS NOT NULL AND u.user_id IN (SELECT user_id FROM c_subscriptions))
            FROM c_signups u LEFT JOIN activated a USING (user_id)""")
        by = {k: round(float(v), 4) for k, v in rows("""SELECT lt, avg(CASE WHEN user_id IN (SELECT user_id FROM activated)
            THEN 1 ELSE 0 END) FROM attribution GROUP BY 1""")}
        m["FIND-03-03"] = {"signup_to_activation": round(act / signups, 4), "activation_to_paid": round(paid / act, 4),
                           "lowest_activation_channel": min(by, key=by.get), "activation_by_channel": dict(sorted(by.items()))}
        revenue, spend = one("""SELECT
                (SELECT sum(p.amount_eur) FROM attribution a JOIN c_subscriptions s USING (user_id) JOIN c_payments p USING (subscription_id)
                 WHERE a.lt = 'review_sites' AND a.signup_ts < TIMESTAMPTZ '2025-10-01 00:00:00+00' AND NOT p.refunded
                   AND p.paid_at < a.signup_ts + INTERVAL 90 DAY),
                (SELECT sum(spend) FROM c_spend WHERE channel_name = 'review_sites' AND spend_date < DATE '2025-10-01')""")
        share = one("""SELECT avg(CASE WHEN lt = 'review_sites' THEN 1 ELSE 0 END) FROM attribution
                       WHERE lt IN (SELECT channel_name FROM c_channels WHERE channel_group <> 'unpaid')""")[0]
        m["FIND-03-04"] = {"roas": round(float(revenue / spend), 4), "share_of_paid_channel_signups": round(float(share), 4)}
        below, above, n_below, n_above = one(f"""WITH w AS (SELECT CAST(date_trunc('week', spend_date) AS DATE) AS wk, sum(spend) AS spend
                                                          FROM c_spend WHERE channel_name = 'meta' GROUP BY 1),
                s AS (SELECT CAST(date_trunc('week', signup_ts) AS DATE) AS wk, count(*) AS n FROM attribution WHERE lt = 'meta' GROUP BY 1),
                j AS (SELECT w.spend, coalesce(s.n, 0) AS n FROM w LEFT JOIN s USING (wk)
                      WHERE w.wk BETWEEN DATE '{FULL_WEEKS[0]}' AND DATE '{FULL_WEEKS[1]}')
            SELECT regr_slope(n, spend) FILTER (WHERE spend < {SATURATION_EUR_WEEK}), regr_slope(n, spend) FILTER (WHERE spend >= {SATURATION_EUR_WEEK}),
                   count(*) FILTER (WHERE spend < {SATURATION_EUR_WEEK}), count(*) FILTER (WHERE spend >= {SATURATION_EUR_WEEK}) FROM j""")
        m["FIND-03-05"] = {"marginal_cpa_below": round(1 / below, 2), "marginal_cpa_above": round(1 / above, 2),
                           "ratio": round(below / above, 4), "weeks_below": n_below, "weeks_above": n_above}
        corr = one(f"""WITH weeks AS (SELECT CAST(range AS DATE) AS wk FROM range(DATE '{FULL_WEEKS[0]}', DATE '{FULL_WEEKS[1]}' + 7, INTERVAL 7 DAY)),
                yt AS (SELECT CAST(date_trunc('week', spend_date) AS DATE) AS wk, sum(spend) AS y FROM c_spend WHERE channel_name = 'youtube' GROUP BY 1),
                od AS (SELECT CAST(date_trunc('week', signup_ts) AS DATE) AS wk, count(*) AS n FROM attribution WHERE lt IN ('organic', 'direct') GROUP BY 1),
                j AS (SELECT weeks.wk, coalesce(od.n, 0) AS n, coalesce(yt.y, 0) AS y FROM weeks LEFT JOIN od USING (wk) LEFT JOIN yt USING (wk)),
                l AS (SELECT n, y, lag(y, 1) OVER w AS y1, lag(y, 2) OVER w AS y2, lag(y, 3) OVER w AS y3, lag(y, 4) OVER w AS y4
                      FROM j WINDOW w AS (ORDER BY wk))
            SELECT corr(n, y), corr(n, y1), corr(n, y2), corr(n, y3), corr(n, y4) FROM l""")
        m["FIND-03-06"] = {"corr_by_lag": [round(float(x), 4) for x in corr],
                           "gain": round(float(max(corr[1], corr[2]) - corr[0]), 4)}
        bb, bd, ob, od = one("""SELECT
                count(*) FILTER (WHERE lt = 'brand_search' AND d >= DATE '2025-04-07' AND d < DATE '2025-05-05'),
                count(*) FILTER (WHERE lt = 'brand_search' AND d >= DATE '2025-05-05' AND d < DATE '2025-06-02'),
                count(*) FILTER (WHERE lt IN ('organic', 'direct') AND d >= DATE '2025-04-07' AND d < DATE '2025-05-05'),
                count(*) FILTER (WHERE lt IN ('organic', 'direct') AND d >= DATE '2025-05-05' AND d < DATE '2025-06-02')
            FROM (SELECT lt, CAST(signup_ts AS DATE) AS d FROM attribution)""")
        m["FIND-03-07"] = {"recovery": round((od - ob) / (bb - bd), 4) if bb > bd else 0.0, "brand_before": bb, "brand_during": bd,
                           "organic_direct_before": ob, "organic_direct_during": od}
        domains = ", ".join(f"'{d}'" for d in DISPOSABLE_DOMAINS)
        dh_act, dh_disp, dh_n = one(f"""SELECT avg(CASE WHEN a.user_id IN (SELECT user_id FROM activated) THEN 1 ELSE 0 END),
                avg(CASE WHEN u.email_domain IN ({domains}) THEN 1 ELSE 0 END), count(*)
            FROM attribution a JOIN c_signups u USING (user_id) WHERE a.lt_campaign LIKE '%dealhub%'""")
        low = sorted(r[0] for r in rows("""SELECT lt_campaign FROM attribution WHERE lt_campaign IS NOT NULL GROUP BY 1
            HAVING count(*) >= 50 AND avg(CASE WHEN user_id IN (SELECT user_id FROM activated) THEN 1 ELSE 0 END) < 0.1"""))
        m["FIND-03-08"] = {"dealhub_activation": round(float(dh_act), 4), "disposable_share": round(float(dh_disp), 4),
                           "dealhub_signups": dh_n, "low_activation_campaigns": low}
        per = {lt: (float(v), n) for lt, v, n in rows("""WITH pay AS (SELECT s.user_id, p.paid_at, p.amount_eur, p.refunded
                                                                        FROM c_payments p JOIN c_subscriptions s USING (subscription_id)),
                f AS (SELECT user_id, min(paid_at) AS first_paid FROM pay GROUP BY 1 HAVING min(paid_at) < TIMESTAMPTZ '2025-07-01 00:00:00+00'),
                r AS (SELECT f.user_id, coalesce(sum(p.amount_eur) FILTER (WHERE NOT p.refunded AND p.paid_at < f.first_paid + INTERVAL 180 DAY), 0) AS rev
                      FROM f JOIN pay p USING (user_id) GROUP BY 1)
            SELECT a.lt, avg(r.rev), count(*) FROM r JOIN attribution a USING (user_id) GROUP BY 1""")}
        rev = {k: round(v, 2) for k, (v, n) in per.items() if n >= 30}
        ranked = sorted(rev, key=rev.get, reverse=True)
        m["FIND-03-09"] = {"revenue_per_payer": dict(sorted(rev.items())), "top_two": sorted(ranked[:2]), "lowest": ranked[-1],
                           "organic_over_meta": round(rev["organic"] / rev["meta"], 4) if rev.get("meta") else 0.0}
        m["FIND-03-10"] = {}
        for c in ("youtube", "meta"):
            total, ft, lt = one(f"""SELECT (SELECT sum(spend) FROM c_spend WHERE channel_name = '{c}'),
                (SELECT count(*) FROM attribution WHERE ft = '{c}'), (SELECT count(*) FROM attribution WHERE lt = '{c}')""")
            ft_cac, lt_cac = float(total) / ft, float(total) / lt
            m["FIND-03-10"][c] = {"first_touch_cac": round(ft_cac, 2), "last_touch_cac": round(lt_cac, 2),
                                  "gap": round(abs(ft_cac / lt_cac - 1), 4)}

        def linkedin_days(shift):
            return f"""WITH li AS (SELECT spend_date + {shift} AS d, sum(spend) AS spend FROM r_spend
                                   WHERE channel_name = 'linkedin' GROUP BY 1),
                    su AS (SELECT CAST(signup_ts AS DATE) AS d, count(*) AS n FROM r_last_touch WHERE lt = 'linkedin' GROUP BY 1)
                SELECT li.d, li.spend, coalesce(su.n, 0) AS n FROM li LEFT JOIN su USING (d)
                WHERE li.d BETWEEN DATE '2024-01-01' AND DATE '2025-12-31'"""

        def monday_ratio(shift):
            return float(one(f"""WITH j AS ({linkedin_days(shift)})
                SELECT (sum(spend) FILTER (WHERE dayofweek(d) = 1) / sum(n) FILTER (WHERE dayofweek(d) = 1))
                     / (sum(spend) FILTER (WHERE dayofweek(d) <> 1) / sum(n) FILTER (WHERE dayofweek(d) <> 1)) FROM j""")[0])

        def weekday_cpa(shift):
            """Each weekday's CPA (spend summed over signups summed) over the pooled CPA, Sunday first (dayofweek)."""
            got = dict(rows(f"""WITH j AS ({linkedin_days(shift)})
                SELECT dayofweek(d), (sum(spend) / sum(n)) / (SELECT sum(spend) / sum(n) FROM j) FROM j GROUP BY 1"""))
            return [round(float(got[k]), 4) for k in range(7)]

        raw_days, fixed_days = weekday_cpa(0), weekday_cpa(1)
        m["FIND-03-11"] = {"raw_monday_ratio": round(monday_ratio(0), 4), "fixed_monday_ratio": round(monday_ratio(1), 4),
                           "raw_weekday_cpa_over_pooled": raw_days, "fixed_weekday_cpa_over_pooled": fixed_days,
                           "raw_highest_weekday": max(range(7), key=lambda k: raw_days[k]),
                           "fixed_weekdays_within_band": all(0.9 <= v <= 1.1 for v in fixed_days)}
        spellings = sorted(r[0] for r in rows("""SELECT DISTINCT s.utm_source FROM r_sessions s JOIN r_campaigns c USING (utm_campaign)
                                                 JOIN r_channels ch USING (channel_id) WHERE ch.channel_name = 'meta'"""))
        mapped, naive = one("""SELECT avg(CASE WHEN lower(trim(utm_source)) IN ('facebook', 'fb', 'meta', 'ig') THEN 1 ELSE 0 END),
                                      avg(CASE WHEN utm_source = 'facebook' THEN 1 ELSE 0 END) FROM r_sessions""")
        m["FIND-03-12"] = {"spellings": len(spellings), "spelling_values": spellings, "mapped_share": round(float(mapped), 4),
                           "naive_share": round(float(naive), 4)}
        eur, naive_total = one("""SELECT sum(a.spend * fx.eur_per_unit), sum(a.spend) FROM r_spend a
                                  JOIN r_fx_rates_monthly fx ON fx.month = date_trunc('month', a.spend_date + 1) AND fx.currency = a.currency
                                  WHERE a.channel_name = 'linkedin'""")
        m["FIND-03-13"] = {"ratio": round(float(eur / naive_total), 4) if naive_total else 0.0}
        con.execute("""CREATE TEMP TABLE local_signups AS SELECT a.lt, u.signup_ts AT TIME ZONE c.timezone AS local_ts
                       FROM c_signups u JOIN c_countries c USING (country_code) JOIN attribution a USING (user_id)""")
        dow = one("SELECT dayofweek(local_ts) FROM local_signups GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1")[0]
        hour = one("SELECT hour(local_ts) FROM local_signups GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1")[0]
        overall, meta = one("""SELECT avg(CASE WHEN dayofweek(local_ts) IN (0, 6) THEN 1 ELSE 0 END),
                                      avg(CASE WHEN dayofweek(local_ts) IN (0, 6) THEN 1 ELSE 0 END) FILTER (WHERE lt = 'meta')
                               FROM local_signups""")
        m["FIND-03-14"] = {"modal_dow": dow, "modal_hour": hour, "overall_weekend_share": round(float(overall), 4),
                           "meta_weekend_share": round(float(meta), 4)}
        share = one("SELECT avg(CASE WHEN channels >= 2 THEN 1 ELSE 0 END) FROM attribution WHERE user_id IN (SELECT user_id FROM payers)")[0]
        path = one("""SELECT path FROM attribution WHERE channels >= 2 AND user_id IN (SELECT user_id FROM payers)
                      GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1""")[0]
        m["FIND-03-15"] = {"multi_channel_share": round(float(share), 4), "modal_path": path}
        return m
    finally:
        con.close()


def check(m: dict) -> None:
    """05's validation table, FIND-03-01 to -15, each with its band; raises ValueError naming the first that fails."""
    f = m["FIND-03-01"]
    _check(0.60 <= f["share"] <= 0.70, f"FIND-03-01: Meta plus nonbrand share of 2025 spend {f['share']}")
    f = m["FIND-03-02"]
    _check(f["top_cpc"] == "linkedin" and f["top_ctr"] == "review_sites", f"FIND-03-02: top CPC {f['top_cpc']}, top CTR {f['top_ctr']}")
    f = m["FIND-03-03"]
    _check(0.40 <= f["signup_to_activation"] <= 0.50 and 0.17 <= f["activation_to_paid"] <= 0.23
           and f["lowest_activation_channel"] == "affiliates",
           f"FIND-03-03: {f['signup_to_activation']}, {f['activation_to_paid']}, lowest {f['lowest_activation_channel']}")
    f = m["FIND-03-04"]
    _check(f["roas"] >= 3.5 and f["share_of_paid_channel_signups"] <= 0.04, f"FIND-03-04: ROAS {f['roas']}, share {f['share_of_paid_channel_signups']}")
    f = m["FIND-03-05"]
    _check(min(f["weeks_below"], f["weeks_above"]) >= 15 and f["ratio"] >= 1.8, f"FIND-03-05: {f}")
    f = m["FIND-03-06"]
    _check(f["gain"] > 0.15, f"FIND-03-06: correlations by lag {f['corr_by_lag']}")
    f = m["FIND-03-07"]
    _check(f["brand_during"] == 0 and 0.7 <= f["recovery"] <= 0.9, f"FIND-03-07: {f}")
    f = m["FIND-03-08"]
    _check(f["dealhub_activation"] < 0.08 and f["disposable_share"] >= 0.5
           and bool(f["low_activation_campaigns"]) and all(DEALHUB in c for c in f["low_activation_campaigns"]), f"FIND-03-08: {f}")
    f = m["FIND-03-09"]
    _check(f["top_two"] == ["organic", "review_sites"] and f["lowest"] == "meta" and f["organic_over_meta"] > 1.3,
           f"FIND-03-09: {f}")
    f = m["FIND-03-10"]
    _check(f["youtube"]["gap"] > 0.4 and f["meta"]["gap"] > 0.4, f"FIND-03-10: {f}")
    f = m["FIND-03-11"]
    _check(f["raw_monday_ratio"] > 1.4 and f["fixed_monday_ratio"] < 1.1, f"FIND-03-11: {f}")
    _check(f["raw_highest_weekday"] == 1 and f["fixed_weekdays_within_band"],
           f"FIND-03-11: by weekday, raw {f['raw_weekday_cpa_over_pooled']}, fixed {f['fixed_weekday_cpa_over_pooled']}")
    f = m["FIND-03-12"]
    _check(f["spellings"] == 5 and 0.21 <= f["mapped_share"] <= 0.27, f"FIND-03-12: {f['spellings']} spellings, {f['mapped_share']}")
    f = m["FIND-03-13"]
    _check(0.86 <= f["ratio"] <= 0.93, f"FIND-03-13: {f['ratio']}")
    f = m["FIND-03-14"]
    _check(f["modal_dow"] in (2, 3) and f["modal_hour"] in (10, 11)
           and f["meta_weekend_share"] > f["overall_weekend_share"] + 0.1, f"FIND-03-14: {f}")
    f = m["FIND-03-15"]
    _check(0.30 <= f["multi_channel_share"] <= 0.40 and f["modal_path"] == "youtube > brand_search", f"FIND-03-15: {f}")


def validate(tables: dict, truth: dict) -> dict:
    """GEN-01: the raw quirks first (each exists in raw and not in clean, with the truth's count), then every finding. Returns
    the measured findings, each marked pass, and the quirks' measures under "raw". Explicit raises, not assert."""
    from . import raw as mv_raw
    quirks = mv_raw.validate(tables, truth)
    m = measure(tables)
    check(m)
    for f in m.values():
        f["pass"] = True
    m["raw"] = quirks
    return m

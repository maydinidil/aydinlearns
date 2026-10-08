"""Voltmarkt (CO-01) generator (knowledge/05 CO-01; design §10).

v0 (slice 1a) built the tables level 1 reads: calendar, stores, categories, products, promotions.
Slice 1b adds the order data level 2 reads through the `sales` view: price_history,
promotion_products, orders and order_lines. Each comes from the stream TABLE_ORDER already reserved
for it, so no v0 table's draws change (GEN-02), and nothing v0 built is changed afterwards. Later
tables are appended to TABLE_ORDER only. Sprint 4a adds competitor_prices (level 3) from its reserved
stream, built after the order data, so no earlier table changes (S4-02).
"""
from __future__ import annotations

import datetime as dt
from decimal import Decimal

import duckdb
import numpy as np
import pyarrow as pa

SEED = 1101
TABLE_ORDER = [
    "calendar", "stores", "categories", "products", "price_history", "promotions",
    "promotion_products", "competitor_prices", "customers", "demand", "inventory_daily",
    "orders", "order_lines", "back_in_stock_requests", "quirks", "cost_history", "inventory_chain",
]
WINDOW_START = dt.date(2024, 1, 1)
WINDOW_END = dt.date(2025, 12, 31)


def rngs(seed: int = SEED) -> dict[str, np.random.Generator]:
    children = np.random.SeedSequence(seed).spawn(len(TABLE_ORDER))
    return {name: np.random.default_rng(child) for name, child in zip(TABLE_ORDER, children)}


# store_code, city, country_code, store_type, timezone, opened_on, close_date
STORES = [
    ("NL-01", "Amsterdam", "NL", "flagship", "Europe/Amsterdam", "2012-03-01", None),
    ("NL-02", "Rotterdam", "NL", "standard", "Europe/Amsterdam", "2013-05-15", None),
    ("NL-03", "Den Haag", "NL", "standard", "Europe/Amsterdam", "2014-02-01", None),
    ("NL-04", "Utrecht", "NL", "standard", "Europe/Amsterdam", "2011-09-01", None),
    ("NL-05", "Eindhoven", "NL", "standard", "Europe/Amsterdam", "2015-04-01", None),
    ("NL-06", "Zwolle", "NL", "standard", "Europe/Amsterdam", "2016-10-01", "2025-06-30"),
    ("NL-07", "Groningen", "NL", "standard", "Europe/Amsterdam", "2016-03-01", None),
    ("NL-08", "Arnhem", "NL", "standard", "Europe/Amsterdam", "2017-06-01", None),
    ("NL-09", "Nijmegen", "NL", "standard", "Europe/Amsterdam", "2018-09-01", None),
    ("NL-10", "Breda", "NL", "outlet", "Europe/Amsterdam", "2019-03-01", None),
    ("NL-11", "Tilburg", "NL", "standard", "Europe/Amsterdam", "2019-11-01", None),
    ("NL-12", "Haarlem", "NL", "standard", "Europe/Amsterdam", "2020-09-01", None),
    ("NL-13", "Almere", "NL", "standard", "Europe/Amsterdam", "2024-09-01", None),
    ("NL-14", "Maastricht", "NL", "standard", "Europe/Amsterdam", "2021-04-01", None),
    ("BE-01", "Brussel", "BE", "flagship", "Europe/Brussels", "2014-09-01", None),
    ("BE-03", "Leuven", "BE", "standard", "Europe/Brussels", "2016-05-01", None),
    ("BE-05", "Liège", "BE", "standard", "Europe/Brussels", "2017-03-01", None),
    ("BE-07", "Gent", "BE", "standard", "Europe/Brussels", "2015-10-01", None),
    ("BE-09", "Mechelen", "BE", "standard", "Europe/Brussels", "2025-03-01", None),
    ("BE-11", "Brugge", "BE", "standard", "Europe/Brussels", "2018-04-01", None),
    ("BE-12", "Namur", "BE", "standard", "Europe/Brussels", "2019-09-01", None),
    ("BE-14", "Antwerpen", "BE", "standard", "Europe/Brussels", "2013-11-01", None),
    ("BE-16", "Hasselt", "BE", "outlet", "Europe/Brussels", "2020-03-01", None),
    ("LU-01", "Luxembourg", "LU", "flagship", "Europe/Luxembourg", "2017-11-01", None),
    ("LU-02", "Esch-sur-Alzette", "LU", "standard", "Europe/Luxembourg", "2022-05-01", None),
]
WEBSHOP = ("WEB-01", "Online", "NL", "web", "UTC", "2015-01-01", None)   # store_id 99

CATEGORIES = {
    "TV & Video": ["TVs up to 43 inch", "TVs 50-55 inch", "TVs 65 inch and up", "Projectors", "TV Mounts", "Streaming Devices"],
    "Computing": ["Laptops", "Desktops", "Monitors", "Tablets", "Keyboards & Mice", "Printers", "Storage", "Networking"],
    "Audio": ["Headphones", "Earbuds", "Soundbars", "Speakers", "Hi-Fi", "Microphones"],
    "Gaming": ["Consoles", "Console Games", "Controllers", "Gaming Headsets", "PC Gaming"],
    "Smart Home": ["Smart Speakers", "Smart Lighting", "Security Cameras", "Thermostats", "Robot Vacuums"],
    "Phones": ["Smartphones", "Phone Cases", "Chargers", "Power Banks"],
    "Accessories": ["Cables", "Batteries", "Memory Cards", "Bags & Sleeves", "Screen Protectors", "Adapters"],
}
# parent -> share of the 1,200 products
SHARES = {"TV & Video": 0.14, "Computing": 0.22, "Audio": 0.16, "Gaming": 0.12, "Smart Home": 0.10,
          "Phones": 0.10, "Accessories": 0.16}
# child -> (median unit cost EUR, lognormal sigma). These are estimates of 2024-2025 Benelux electronics
# wholesale costs, chosen to look plausible to a learner; they are not sourced data (05 gives none).
COST_BANDS = {
    "TVs up to 43 inch": (220, 0.35), "TVs 50-55 inch": (420, 0.35), "TVs 65 inch and up": (850, 0.45),
    "Projectors": (380, 0.6), "TV Mounts": (25, 0.5), "Streaming Devices": (35, 0.45),
    "Laptops": (520, 0.45), "Desktops": (560, 0.5), "Monitors": (170, 0.5), "Tablets": (260, 0.5),
    "Keyboards & Mice": (28, 0.6), "Printers": (110, 0.55), "Storage": (55, 0.6), "Networking": (60, 0.6),
    "Headphones": (75, 0.6), "Earbuds": (45, 0.6), "Soundbars": (180, 0.55), "Speakers": (60, 0.6),
    "Hi-Fi": (300, 0.6), "Microphones": (50, 0.6),
    "Consoles": (330, 0.3), "Console Games": (38, 0.3), "Controllers": (42, 0.35), "Gaming Headsets": (45, 0.5),
    "PC Gaming": (70, 0.8),
    "Smart Speakers": (45, 0.5), "Smart Lighting": (25, 0.6), "Security Cameras": (55, 0.5),
    "Thermostats": (120, 0.4), "Robot Vacuums": (230, 0.5),
    "Smartphones": (380, 0.6), "Phone Cases": (7, 0.5), "Chargers": (12, 0.5), "Power Banks": (18, 0.5),
    "Cables": (9, 0.6), "Batteries": (4, 0.5), "Memory Cards": (12, 0.6), "Bags & Sleeves": (18, 0.5),
    "Screen Protectors": (4, 0.5), "Adapters": (8, 0.5),
}
BRANDS = {"TV & Video": ["Vistara", "Lumio", "Nordvue"], "Computing": ["Kestrel", "Arcbyte", "Polaron"],
          "Audio": ["Sonora", "Basswell", "Echoline"], "Gaming": ["PlayBox", "Joyforge", "Pixelrun"],
          "Smart Home": ["Hivo", "Lumen&Co", "Safewatch"], "Phones": ["Novaphone", "Calla", "Volt Basics"],
          "Accessories": ["Volt Basics", "Cablemate", "Energo"]}
SERIES = ["One", "Air", "Pro", "Max", "Lite", "Neo", "Ultra", "Go"]
# Planted products (knowledge/05 CO-01): id -> (name, brand, category name, unit cost EUR, launch date).
# Names are 05's (lines 100, 122); 05 names no product for the 55-inch TV promo. 05 gives no cost, list
# price or launch date, so these are constants inside each child band, launched before their stories (GEN-03).
PLANTED_PRODUCTS = {
    120: ('Vistara 55" QLED', "Vistara", "TVs 50-55 inch", "520.00", "2023-04-03"),
    311: ("Earbuds Pro X", "Sonora", "Earbuds", "99.00", "2023-09-18"),
    312: ("Earbuds Lite", "Sonora", "Earbuds", "39.00", "2022-03-14"),
    540: ("PlayBox 5", "PlayBox", "Consoles", "415.00", "2021-11-19"),
}
# Planted promotions: code -> (name, type, start, end, discount_pct). P-2025-03 and the P-2024-20 dates are
# 05's (lines 118, 119). Black Week runs Monday to Sunday around Black Friday (DDB-05) and is the 29th
# promotion of its year by start date. Random promotions stay out of each plant's baseline window.
PLANTED_PROMOS = {
    "P-2024-20": ("Autumn TV Days", "percent_off", "2024-10-07", "2024-10-20", "15.00"),
    "P-2024-29": ("Black Week", "percent_off", "2024-11-25", "2024-12-01", "25.00"),
    "P-2025-03": ("Spring Audio Deals", "percent_off", "2025-03-10", "2025-03-23", "25.00"),
    "P-2025-29": ("Black Week", "percent_off", "2025-11-24", "2025-11-30", "25.00"),
}
PROMO_GAP_BEFORE = dt.timedelta(28)   # FIND-01-05: the 4 weeks before a promotion are its baseline
PROMO_GAP_AFTER = dt.timedelta(14)    # FIND-01-06: the 2 weeks after a promotion show the dip
EVENTS = {"2024-11-29": "black_friday", "2025-11-28": "black_friday",
          "2024-12-02": "cyber_monday", "2025-12-01": "cyber_monday"}
# Fixed English names: strftime("%A") and ("%B") follow LC_TIME, so a Dutch locale would change the data.
WEEKDAY_NAMES = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
MONTH_NAMES = ("January", "February", "March", "April", "May", "June", "July", "August", "September",
               "October", "November", "December")

# ---- Slice 1b: the order data (design §10; ERRATA rows with Slice = 1b) ----------------------------
# Every number below is a calibration estimate chosen so that 05's planted findings hold, unless a
# comment cites 05 or ERRATA for it. None of them is sourced data.
LEVEL1_TABLES = ["calendar", "stores", "categories", "products", "promotions"]
ORDER_TABLES = ["price_history", "promotion_products", "orders", "order_lines"]
LEVEL3_TABLES = ["competitor_prices"]                   # sprint 4a (S4-02)
NO_NETWORK = {"autoinstall_known_extensions": False, "autoload_known_extensions": False}   # ruling R17

# Demand: each parent's share of order lines at launch prices, split over its children (equally, or by
# CHILD_DEMAND's weight), then Zipf (05: b = 1.1) by a random rank inside each child. Calibrated so that
# E-147 holds (TV & Video leads revenue, Accessories leads units) and the planted findings survive noise:
# Earbuds and Laptops sell enough units per SKU for FIND-01-05 and FIND-01-11, and consoles and gaming PCs
# (few, expensive lines) do not dominate FIND-01-04's gift revenue.
PARENT_DEMAND = {"TV & Video": 0.13, "Computing": 0.11, "Audio": 0.15, "Gaming": 0.12, "Smart Home": 0.07,
                 "Phones": 0.14, "Accessories": 0.28}
CHILD_DEMAND = {"Earbuds": 6.0, "Laptops": 3.0, "Cables": 2.0, "Consoles": 0.5, "Console Games": 2.0, "PC Gaming": 0.4}
ZIPF_B = 1.1
# Planted products' share of all order lines (GEN-03). E-094: Earbuds Lite sells 1.7 times Earbuds Pro X.
PLANTED_DEMAND = {311: 0.0125, 312: 0.0125 * 1.7, 540: 0.006, 120: 0.004}
# Planted products keep one list price for the whole window (cost about 55% of it, Task 9's ruling).
PLANTED_LIST_PRICES = {120: "899.00", 311: "179.00", 312: "69.00", 540: "499.00"}

# Unit cost as a share of the launch list price, per child category (an estimate of Benelux retail margins).
COST_SHARE = {
    "TVs up to 43 inch": 0.78, "TVs 50-55 inch": 0.76, "TVs 65 inch and up": 0.74, "Projectors": 0.68,
    "TV Mounts": 0.45, "Streaming Devices": 0.62,
    "Laptops": 0.82, "Desktops": 0.80, "Monitors": 0.75, "Tablets": 0.80, "Keyboards & Mice": 0.50,
    "Printers": 0.70, "Storage": 0.60, "Networking": 0.60,
    "Headphones": 0.55, "Earbuds": 0.55, "Soundbars": 0.62, "Speakers": 0.55, "Hi-Fi": 0.62, "Microphones": 0.55,
    "Consoles": 0.86, "Console Games": 0.74, "Controllers": 0.60, "Gaming Headsets": 0.55, "PC Gaming": 0.62,
    "Smart Speakers": 0.62, "Smart Lighting": 0.50, "Security Cameras": 0.55, "Thermostats": 0.62, "Robot Vacuums": 0.66,
    "Smartphones": 0.82, "Phone Cases": 0.30, "Chargers": 0.40, "Power Banks": 0.50,
    "Cables": 0.40, "Batteries": 0.45, "Memory Cards": 0.55, "Bags & Sleeves": 0.45, "Screen Protectors": 0.30,
    "Adapters": 0.40,
}
# FIND-01-12: these accessories are priced near cost, so a promotion of 30% or more sells them at a loss.
# Their cost share is overwritten after the draws (the Task 9 precedent): products keeps its unit costs,
# and the list price is set from them, so no level 1 table changes and no stream shifts.
THIN_MARGIN_CHILDREN = ("Batteries", "Memory Cards")
THIN_MARGIN_COST_SHARE = 0.82           # plus 0.01 per (product_id % 5), so 0.82 to 0.86
THIN_MARGIN_FLOOR = 0.71                # cost stays above 71% of every list price the product ever has
# Price elasticity of units to the list price, per child (05: laptops -2.6, TVs -2.4, cables -0.8);
# the rest are estimates by parent. A promotion lifts units with 05's promo elasticity of -3.5.
ELASTICITY = {"Laptops": -2.6, "TVs up to 43 inch": -2.4, "TVs 50-55 inch": -2.4, "TVs 65 inch and up": -2.4,
              "Cables": -0.8}
PARENT_ELASTICITY = {"TV & Video": -2.0, "Computing": -2.0, "Audio": -1.8, "Gaming": -1.6, "Smart Home": -1.6,
                     "Phones": -1.8, "Accessories": -1.0}
PROMO_ELASTICITY = -3.5
PROMO_LIFT_CAP = 4.0                    # a 50% clearance would otherwise lift units 11 times
# List price changes: about 8.5 drawn per product over the window (05: about 9,000 price_history rows). The log
# price is a mean-reverting walk around the launch price with steps of at most 9% either way, so prices have no
# trend (a trend would bias FIND-01-11's slope) and a random rise is at most 9.5%: FIND-01-08's planted rises are
# the only ones of 10% or more.
PRICE_CHANGES_PER_PRODUCT = 8.5
PRICE_STEP_SIGMA = 0.08
PRICE_REVERSION = 0.3
MAX_PRICE_STEP = 0.09
MAX_RANDOM_RISE = 1.095
# FIND-01-11's categories are price-matched: their list prices move twice as often and further, so the
# weekly slope is measurable SKU by SKU (E-014).
PRICE_MATCHED = {"children": ("Laptops", "Cables"), "changes": 17.0, "sigma": 0.14, "reversion": 0.2}
ELASTICITY_MIN_WEEKS = 100              # E-014's check uses SKUs sold in at least 100 of the window's 105 weeks
MIN_CHANGE_GAP_DAYS = 7
# Planted promotions' products keep their list price from 28 days before to 14 days after the promotion,
# so FIND-01-05's and FIND-01-06's baselines show only the planted effect.
PLANT_PRICE_FREEZE = (dt.timedelta(28), dt.timedelta(14))
# FIND-01-08 (E-093): 4 SKUs whose list price rises 10-20% shortly before Black Week, then falls back after it.
# product_id: (promotion, days before its start, rise factor).
FAKE_RAISES = {3: ("P-2024-29", 10, 1.15), 169: ("P-2024-29", 12, 1.12),
               9: ("P-2025-29", 13, 1.14), 435: ("P-2025-29", 9, 1.18)}

# Promotion membership: about 900 rows (05). Planted promotions get planted members.
TV_PROMO_SIZE = 12                      # P-2024-20: product 120 and the other best-selling 50-55 inch TVs
AUDIO_PROMO_SIZE = 10                   # P-2025-03: Earbuds Pro X and 9 audio products that are not earbuds
BLACK_WEEK_SIZE = 56                    # plus the year's FAKE_RAISES
RANDOM_PROMO_SIZE = (12, 17)            # integers(low, high): 12 to 16 products
DEEP_PROMO_PCT = 30                     # FIND-01-12's threshold
DEEP_PROMO_THIN = 2                     # thin-margin accessories in every promotion of 30% or more
# Members are drawn with weight demand ** power: a lower power spreads promotions beyond the best sellers.
MEMBER_POWER = {"audio": 1.0, "black_week": 0.7, "thin": 0.3, "random": 0.4}

# Orders. 05: basket 1 + Poisson(0.6); web share 0.38; about 600,000 orders. E-105: about 960,000 lines.
BASKET_EXTRA = 0.6
LINES_PER_ORDER = 1 + BASKET_EXTRA
STORE_LINES_PER_DAY = 28.8              # a standard store, before the weekday and season factors
STORE_SIZE = {"flagship": 1.8, "standard": 1.0, "outlet": 0.7}
# Luxembourg's two stores also serve shoppers from across the border, so each sells more than its type
# suggests. Calibration: FIND-01-04 measures LU on few sales, and more of them keep its ratio steady.
COUNTRY_STORE_SIZE = {"LU": 1.6}
WEB_LINES_PER_DAY = 447.0
COUNTRIES = ("NL", "BE", "LU")
WEB_COUNTRY_MIX = (0.61, 0.30, 0.09)    # E-016: a web order draws its ship-to country from the country mix
CUSTOMERS = 150_000                     # 05: customers is 150,000 rows; the table itself arrives later
GUEST_SHARE = 0.25                      # 05 Q-01-03: 25% of orders are guest orders (customer_id missing)
# Units per line: 1, plus Poisson(lambda) for children bought several at a time, at most 6.
MULTI_UNIT = {"Cables": 0.5, "Batteries": 0.9, "Memory Cards": 0.3, "Screen Protectors": 0.3, "Adapters": 0.3,
              "Phone Cases": 0.2, "Console Games": 0.25, "Smart Lighting": 0.6, "Chargers": 0.2}
MAX_QUANTITY = 6
# Order times (local wall-clock time; NL, BE and LU share one time zone): relative weights per hour.
STORE_HOURS = dict(zip(range(9, 21), (0.5, 0.8, 1.0, 1.1, 1.2, 1.3, 1.3, 1.2, 1.0, 0.8, 0.6, 0.4)))
SUNDAY_HOURS = dict(zip(range(12, 18), (1.0, 1.1, 1.1, 1.0, 0.9, 0.7)))
WEB_HOURS = dict(zip(range(24), (0.3, 0.2, 0.1, 0.1, 0.1, 0.2, 0.4, 0.7, 0.9, 1.0, 1.0, 1.1,
                                 1.2, 1.1, 1.0, 1.0, 1.0, 1.1, 1.3, 1.6, 1.8, 1.8, 1.4, 0.8)))
# Seasonality (05 DIST-08), Monday first.
STORE_WEEKDAY = (0.85, 0.85, 0.9, 1.0, 1.15, 1.45, 0.8)
WEB_WEEKDAY = (1.05, 1.0, 1.0, 0.95, 0.9, 0.9, 1.2)
MONTH_FACTOR = (1.0, 0.9, 0.9, 0.9, 0.9, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0)
# E-079: Black Week runs from the Monday before Black Friday to Cyber Monday; 05: web x2.2, CM electronics peak.
BLACK_WEEK = {2024: ("2024-11-25", "2024-12-02"), 2025: ("2025-11-24", "2025-12-01")}
BLACK_WEEK_FACTOR = {"store": 1.6, "web": 2.2}
BLACK_FRIDAY_FACTOR = {"store": 2.2, "web": 3.0}
CYBER_MONDAY_FACTOR = {"store": 1.2, "web": 3.3}
CYBER_MONDAY_COMPUTING = 2.0            # web orders, Computing products
# FIND-01-04 as E-079 rewrites it: gifts (Gaming, and Headphones) from 20 Nov to 5 Dec, stacked on Black Week.
GIFT_PARENTS = ("Gaming",)
GIFT_CHILDREN = ("Headphones",)
SINTERKLAAS = ((11, 20), (12, 5))
SINTERKLAAS_FACTOR = {"NL": 1.6, "BE": 1.6, "LU": 1.1}
AFTER_SINTERKLAAS = ((12, 6), (12, 7))  # the drop on 6 Dec: gifts fall below their usual level for two days
AFTER_SINTERKLAAS_FACTOR = {"NL": 0.6, "BE": 0.6, "LU": 1.0}
# Gifts get no random promotion and no random list price change from 1 Oct to 7 Dec, so the October baseline
# and the Sinterklaas days differ only by the Sinterklaas effect (Black Week, excluded from the window, still runs).
GIFT_QUIET = ((10, 1), (12, 7))
# Christmas and New Year: (month, day) -> (store, web). Stores close on 25 Dec and 1 Jan.
CHRISTMAS_RUN = ((12, 9), (12, 23), 1.35)
HOLIDAYS = {(12, 24): (1.0, 0.8), (12, 25): (0.0, 0.6), (12, 26): (1.3, 1.0), (12, 27): (1.1, 1.1),
            (12, 28): (1.1, 1.1), (12, 29): (1.1, 1.1), (12, 30): (1.1, 1.1), (12, 31): (1.1, 1.1), (1, 1): (0.0, 0.6)}
# FIND-01-05 (E-094): during P-2025-03, Earbuds Lite loses 40% of Earbuds Pro X's extra units.
CANNIBALISATION = {"promo": "P-2025-03", "from": 311, "to": 312, "share": 0.40}
# FIND-01-06: after the TV promotion, its products sell at 80% of their baseline for 2 weeks.
POST_PROMO_DIP = {"promo": "P-2024-20", "days": 14, "factor": 0.80}
# FIND-01-07: an order with a TV on promotion adds a soundbar more often (about 3 times the usual attach rate).
HALO = {"tv_children": ("TVs up to 43 inch", "TVs 50-55 inch", "TVs 65 inch and up"), "child": "Soundbars", "attach": 0.03}
# FIND-01-09: PlayBox 5 is out of stock chain-wide, so it sells nothing (05: 2024-12-06 to 2024-12-27).
STOCKOUT = {"product_id": 540, "start": "2024-12-06", "end": "2024-12-27"}

# ---- Sprint 4a: competitor prices (05 CO-01; S4-02) ----------------------------------------------------
# 05: Voltmarkt "competes on price with two national rivals"; competitor_prices holds product, competitor,
# observed time and price (about 150,000 rows), and its business logic includes competitor undercutting. The
# table draws only from the stream TABLE_ORDER reserved for it and is built after the order data, from list
# prices already drawn, so no other table changes (GEN-02). The rivals' names are invented. Every number
# below is a calibration estimate, not sourced data.
COMPETITORS = ("Bliksem", "Stroomhuis")                    # the cheaper rival first
COMPETITOR_TRACKED = {"Bliksem": 860, "Stroomhuis": 710}   # products each rival checks, drawn by popularity
COMPETITOR_TRACK_POWER = 0.5                               # weight demand ** power: a rival checks beyond the best sellers
COMPETITOR_LEVEL = {"Bliksem": 0.97, "Stroomhuis": 1.03}   # a rival's usual price against Voltmarkt's list price
COMPETITOR_PRODUCT_SIGMA = 0.03                            # each checked product's own offset (log scale)
COMPETITOR_WEEK_SIGMA = 0.02                               # week-to-week noise (log scale)
UNDERCUT_START = 0.02                                      # the chance that a run of undercut weeks starts in a week
UNDERCUT_WEEKS = (1, 5)                                    # integers(low, high): runs of 1 to 4 weeks
UNDERCUT_DEPTH = (0.86, 0.93)                              # a run's price against the rival's usual price
COMPETITOR_BAND = (0.80, 1.20)                             # a rival's price stays inside this band of the list price
OBSERVED_HOURS = (5, 9)                                    # integers(low, high): weekly checks run 05:00 to 08:59 UTC
RECHECK_SHARE = 0.03                                       # a second check of the product later the same day
RECHECK_GAP_HOURS = (6, 13)                                # integers(low, high): 6 to 12 hours after the first


def d(s: str | None) -> dt.date | None:
    return None if s is None else dt.date.fromisoformat(s)


def money(x: float) -> Decimal:
    return Decimal(f"{x:.2f}")


def build_calendar() -> pa.Table:
    days = [WINDOW_START + dt.timedelta(n) for n in range((WINDOW_END - WINDOW_START).days + 1)]

    def event(day: dt.date) -> str | None:
        e = EVENTS.get(day.isoformat())
        if e:
            return e
        if (day.month == 11 and day.day >= 20) or (day.month == 12 and day.day <= 5):
            return "sinterklaas"
        return None

    return pa.table({
        "cal_date": pa.array(days, pa.date32()),
        "iso_year": pa.array([x.isocalendar()[0] for x in days], pa.int32()),
        "iso_week": pa.array([x.isocalendar()[1] for x in days], pa.int32()),
        "week_start": pa.array([x - dt.timedelta(x.weekday()) for x in days], pa.date32()),
        "month_start": pa.array([x.replace(day=1) for x in days], pa.date32()),
        "month": pa.array([x.month for x in days], pa.int32()),
        "quarter": pa.array([(x.month - 1) // 3 + 1 for x in days], pa.int32()),
        "weekday_name": pa.array([WEEKDAY_NAMES[x.weekday()] for x in days], pa.string()),
        "is_weekend": pa.array([x.weekday() >= 5 for x in days], pa.bool_()),
        "event": pa.array([event(x) for x in days], pa.string()),
    })


def build_stores() -> pa.Table:
    rows = [(i + 1, *s) for i, s in enumerate(STORES)] + [(99, *WEBSHOP)]
    return pa.table({
        "store_id": pa.array([r[0] for r in rows], pa.int32()),
        "store_code": [r[1] for r in rows], "city": [r[2] for r in rows], "country_code": [r[3] for r in rows],
        "store_type": [r[4] for r in rows], "timezone": [r[5] for r in rows],
        "opened_on": pa.array([d(r[6]) for r in rows], pa.date32()),
        "close_date": pa.array([d(r[7]) for r in rows], pa.date32()),
    })


def build_categories() -> tuple[pa.Table, dict[str, int]]:
    names, parents = [], []
    for parent, children in CATEGORIES.items():
        for child in children:
            names.append(child)
            parents.append(parent)
    ids = list(range(1, len(names) + 1))
    table = pa.table({"category_id": pa.array(ids, pa.int32()), "category_name": names, "parent_category": parents})
    return table, dict(zip(names, ids))


def build_products(rng: np.random.Generator, cat_ids: dict[str, int]) -> pa.Table:
    counts = {p: int(round(1200 * share)) for p, share in SHARES.items()}
    counts["Computing"] += 1200 - sum(counts.values())          # make the total exactly 1200
    rows = []
    pid = 1
    launch_span = (dt.date(2025, 9, 30) - dt.date(2019, 1, 1)).days
    for parent, n in counts.items():
        children = CATEGORIES[parent]
        for k in range(n):
            child = children[k % len(children)]
            median, sigma = COST_BANDS[child]
            brand = BRANDS[parent][int(rng.integers(0, 3))]
            name = f"{brand} {SERIES[int(rng.integers(0, len(SERIES)))]} {int(rng.integers(100, 999))}"
            cost = float(np.clip(rng.lognormal(np.log(median), sigma), 1.5, 3000))
            launch = dt.date(2019, 1, 1) + dt.timedelta(int(rng.integers(0, launch_span)))
            rows.append({"product_id": pid, "brand": brand, "product_name": name, "category_id": cat_ids[child],
                         "unit_cost_eur": money(cost), "launch_date": launch})
            pid += 1
    by_id = {r["product_id"]: r for r in rows}
    # Overwrite after the draws, so the other products' random streams do not shift.
    for pid_, (name, brand, child, cost, launch) in PLANTED_PRODUCTS.items():
        by_id[pid_].update(product_name=name, brand=brand, category_id=cat_ids[child],
                           unit_cost_eur=Decimal(cost), launch_date=d(launch))
    # Unique names, with no random draws: in product_id order, a taken name bumps its model number by 1.
    taken = {v[0] for v in PLANTED_PRODUCTS.values()}
    for r in rows:
        if r["product_id"] in PLANTED_PRODUCTS:
            continue
        while r["product_name"] in taken:
            head, number = r["product_name"].rsplit(" ", 1)
            r["product_name"] = f"{head} {int(number) + 1}"
        taken.add(r["product_name"])
    # Sister pairs: the planted pair, then about 5% more pairs of the same brand and category.
    sister: dict[int, int] = {311: 312, 312: 311}
    candidates = [r["product_id"] for r in rows if r["product_id"] not in sister and r["product_id"] not in PLANTED_PRODUCTS]
    rng.shuffle(candidates)
    for a in candidates:
        if len(sister) >= 62:
            break
        if a in sister:
            continue
        partner = next((b for b in candidates if b != a and b not in sister
                        and by_id[b]["category_id"] == by_id[a]["category_id"] and by_id[b]["brand"] == by_id[a]["brand"]), None)
        if partner is not None:
            sister[a], sister[partner] = partner, a
    id_to_name = {v: k for k, v in cat_ids.items()}
    return pa.table({
        "product_id": pa.array([r["product_id"] for r in rows], pa.int32()),
        "sku": [f"VM-{r['product_id']:06d}" for r in rows],
        "product_name": [r["product_name"] for r in rows],
        "brand": [r["brand"] for r in rows],
        "category_id": pa.array([r["category_id"] for r in rows], pa.int32()),
        "category_raw": [id_to_name[r["category_id"]] for r in rows],
        "sister_product_id": pa.array([sister.get(r["product_id"]) for r in rows], pa.int32()),
        "unit_cost_eur": pa.array([r["unit_cost_eur"] for r in rows], pa.decimal128(10, 2)),
        "launch_date": pa.array([r["launch_date"] for r in rows], pa.date32()),
    })


def build_promotions(rng: np.random.Generator) -> pa.Table:
    # A random 14-day promotion may not overlap any plant's window, 28 days before to 14 days after it.
    windows = [(d(v[2]) - PROMO_GAP_BEFORE, d(v[3]) + PROMO_GAP_AFTER) for v in PLANTED_PROMOS.values()]
    rows = []
    for year in (2024, 2025):
        days = [dt.date(year, 1, 1) + dt.timedelta(n) for n in range(366)]
        mondays = [m for m in days if m.year == year and m.weekday() == 0 and m + dt.timedelta(13) <= dt.date(year, 12, 31)
                   and all(m + dt.timedelta(13) < lo or m > hi for lo, hi in windows)]
        planted_this_year = [c for c in PLANTED_PROMOS if c.startswith(f"P-{year}-")]
        needed = 30 - len(planted_this_year)
        if len(mondays) < needed:
            raise ValueError(f"{year}: only {len(mondays)} eligible Mondays for {needed} random promotions")
        picks = sorted(rng.choice(len(mondays), size=needed, replace=False))
        used_numbers = {int(c[-2:]) for c in planted_this_year}
        numbers = [n for n in range(1, 61) if n not in used_numbers]
        for k, idx in enumerate(picks):
            start = mondays[int(idx)]
            ptype = str(rng.choice(["percent_off", "bundle", "clearance", "loyalty"], p=[0.6, 0.15, 0.15, 0.10]))
            pct = {"percent_off": [10, 15, 20, 25, 30, 40], "bundle": [15], "clearance": [30, 40, 50], "loyalty": [10]}[ptype]
            rows.append({"code": f"P-{year}-{numbers[k]:02d}", "name": f"{MONTH_NAMES[start.month - 1]} {ptype.replace('_', ' ').title()}",
                         "type": ptype, "start": start, "end": start + dt.timedelta(13),
                         "pct": Decimal(f"{int(rng.choice(pct))}.00")})
        for code in planted_this_year:
            name, ptype, s, e, pct = PLANTED_PROMOS[code]
            rows.append({"code": code, "name": name, "type": ptype, "start": d(s), "end": d(e), "pct": Decimal(pct)})
    rows.sort(key=lambda r: (r["start"], r["code"]))
    return pa.table({
        "promo_id": pa.array(list(range(1, len(rows) + 1)), pa.int32()),
        "promo_code": [r["code"] for r in rows], "promo_name": [r["name"] for r in rows],
        "promo_type": [r["type"] for r in rows],
        "start_date": pa.array([r["start"] for r in rows], pa.date32()),
        "end_date": pa.array([r["end"] for r in rows], pa.date32()),
        "discount_pct": pa.array([r["pct"] for r in rows], pa.decimal128(5, 2)),
    })


def inject_product_quirks(rng: np.random.Generator, products: pa.Table) -> pa.Table:
    """Q-01-04 (category_raw variants, 3% NULL category_id) and Q-01-07 (2% messy sku). Raw only."""
    rows = products.to_pylist()
    variants = {"TVs 50-55 inch": ["TV & Video", "tv en video", "TV/Video ", "Téléviseurs"]}
    n = len(rows)
    for i in rng.choice(n, size=int(round(0.03 * n)), replace=False):
        rows[int(i)]["category_id"] = None
    for i in rng.choice(n, size=int(round(0.02 * n)), replace=False):
        rows[int(i)]["sku"] = rows[int(i)]["sku"].lower() + ("  " if int(i) % 2 else "")
    for r in rows:
        if r["category_raw"] in variants:
            r["category_raw"] = variants[r["category_raw"]][int(rng.integers(0, 4))]
    return pa.Table.from_pylist(rows, schema=products.schema)


# ---- Slice 1b builders --------------------------------------------------------------------------------

def window_days() -> list[dt.date]:
    return [WINDOW_START + dt.timedelta(n) for n in range((WINDOW_END - WINDOW_START).days + 1)]


def day_of(day: dt.date) -> int:
    return (day - WINDOW_START).days


def decimal_array(cents: np.ndarray) -> pa.Array:
    """DECIMAL(10,2) from whole cents, without building a Decimal per value (little-endian 128-bit)."""
    c = np.ascontiguousarray(cents, dtype=np.int64)
    words = np.empty((len(c), 2), dtype=np.int64)
    words[:, 0] = c
    words[:, 1] = np.where(c < 0, -1, 0)
    return pa.Array.from_buffers(pa.decimal128(10, 2), len(c), [None, pa.py_buffer(words.tobytes())])


def product_frame(products: pa.Table, categories: pa.Table) -> dict:
    """Per-product arrays, indexed by product_id - 1 (v0's product ids run 1 to 1,200 in order)."""
    cats = {r["category_id"]: (r["category_name"], r["parent_category"]) for r in categories.to_pylist()}
    rows = products.to_pylist()
    if [r["product_id"] for r in rows] != list(range(1, len(rows) + 1)):
        raise ValueError("product ids must run 1..n in order")
    return {
        "child": np.array([cats[r["category_id"]][0] for r in rows], dtype=object),
        "parent": np.array([cats[r["category_id"]][1] for r in rows], dtype=object),
        "launch": np.array([day_of(r["launch_date"]) for r in rows]),
        "launch_date": [r["launch_date"] for r in rows],
        "cost": np.array([int(r["unit_cost_eur"] * 100) for r in rows], dtype=np.int64),
    }


def is_gift(pf: dict) -> np.ndarray:
    return np.isin(pf["parent"], GIFT_PARENTS) | np.isin(pf["child"], GIFT_CHILDREN)


def gift_quiet(first: dt.date, last: dt.date) -> bool:
    """True when any day from first to last falls in GIFT_QUIET (1 Oct to 7 Dec of any year)."""
    (m0, d0), (m1, d1) = GIFT_QUIET
    day = first
    while day <= last:
        if (m0, d0) <= (day.month, day.day) <= (m1, d1):
            return True
        day += dt.timedelta(1)
    return False


def customer_countries(rng: np.random.Generator) -> np.ndarray:
    """Home country (index into COUNTRIES) of customers 1..CUSTOMERS: the first draw on the customers stream.

    The customers table arrives in a later slice; its builder must make this call first, so each customer's
    country matches the country their orders ship to.
    """
    return rng.choice(len(COUNTRIES), size=CUSTOMERS, p=WEB_COUNTRY_MIX)


def build_demand(rng: np.random.Generator, pf: dict) -> np.ndarray:
    """Each product's share of order lines at its launch price (05 DIST-01: Zipf by rank inside each child).

    A child's share of its parent is fixed (CHILD_DEMAND), so the category mix does not depend on which
    product draws the top rank.
    """
    w = np.zeros(len(pf["child"]))
    for parent, share in PARENT_DEMAND.items():
        children = CATEGORIES[parent]
        weights = np.array([CHILD_DEMAND.get(c, 1.0) for c in children])
        for child, child_share in zip(children, share * weights / weights.sum()):
            idx = np.flatnonzero(pf["child"] == child)
            raw = (rng.permutation(len(idx)) + 1).astype(float) ** -ZIPF_B
            w[idx] = child_share * raw / raw.sum()
    for pid, share in PLANTED_DEMAND.items():          # overwritten after the draws (GEN-03)
        w[pid - 1] = share
    return w


def build_promotion_products(rng: np.random.Generator, promotions: pa.Table, pf: dict, demand: np.ndarray) -> pa.Table:
    n = len(pf["child"])
    ids = np.arange(1, n + 1)
    planted = np.isin(ids, list(PLANTED_DEMAND))
    thin = np.isin(pf["child"], THIN_MARGIN_CHILDREN)
    gifts = is_gift(pf)
    out_start, out_end = d(STOCKOUT["start"]), d(STOCKOUT["end"])
    fakes: dict[str, list[int]] = {}
    for pid, (code, _, _) in FAKE_RAISES.items():
        fakes.setdefault(code, []).append(pid)

    def sample(candidates: np.ndarray, size: int, power: float) -> list[int]:
        weights = demand[candidates] ** power
        picks = rng.choice(candidates, size=size, replace=False, p=weights / weights.sum())
        return [int(i) + 1 for i in picks]

    rows = []
    for p in promotions.to_pylist():
        start, end, code = p["start_date"], p["end_date"], p["promo_code"]
        ok = pf["launch"] <= day_of(start)
        if start <= out_end and end >= out_start:
            ok[STOCKOUT["product_id"] - 1] = False
        if code == POST_PROMO_DIP["promo"]:
            tvs = np.flatnonzero(ok & (pf["child"] == "TVs 50-55 inch") & ~planted)
            best = tvs[np.argsort(-demand[tvs], kind="stable")][:TV_PROMO_SIZE - 1]
            members = [120] + [int(i) + 1 for i in best]
        elif code == CANNIBALISATION["promo"]:
            audio = np.flatnonzero(ok & (pf["parent"] == "Audio") & (pf["child"] != "Earbuds") & ~planted)
            members = [CANNIBALISATION["from"]] + sample(audio, AUDIO_PROMO_SIZE - 1, MEMBER_POWER["audio"])
        elif code in PLANTED_PROMOS:                   # Black Week, both years
            forced = fakes.get(code, [])
            pool = ok & ~planted & (pf["parent"] != "Accessories") & ~np.isin(ids, forced)
            members = forced + sample(np.flatnonzero(pool), BLACK_WEEK_SIZE, MEMBER_POWER["black_week"])
        else:
            size = int(rng.integers(*RANDOM_PROMO_SIZE))
            pool = ok & ~planted & ~np.isin(ids, list(FAKE_RAISES))
            if gift_quiet(start, end):
                pool &= ~gifts
            members = []
            if float(p["discount_pct"]) >= DEEP_PROMO_PCT:     # FIND-01-12: deep promotions reach the thin-margin accessories
                members = sample(np.flatnonzero(pool & thin), DEEP_PROMO_THIN, MEMBER_POWER["thin"])
                pool[np.array(members) - 1] = False
            members += sample(np.flatnonzero(pool), size - len(members), MEMBER_POWER["random"])
        rows += [(p["promo_id"], m) for m in sorted(members)]
    return pa.table({"promo_id": pa.array([r[0] for r in rows], pa.int32()),
                     "product_id": pa.array([r[1] for r in rows], pa.int32())})


def price_step(cents: int) -> int:
    return 10 if cents < 1000 else (100 if cents < 20000 else 1000)


def retail_cents(cents: float) -> int:
    """A shelf price ending in 9: 4.39, 12.99, 549.99."""
    step = price_step(int(cents))
    return max(int(round(cents / step)) * step - 1, 99)


def build_price_history(rng: np.random.Generator, pf: dict, promotions: pa.Table, promo_products: pa.Table) -> pa.Table:
    """List prices (E-103: the price a line sells at, before any promotion discount), one row per period."""
    n = len(pf["child"])
    span_days = (WINDOW_END - WINDOW_START).days + 1
    share = np.clip(np.array([COST_SHARE[c] for c in pf["child"]]) * np.exp(rng.normal(0.0, 0.06, n)), 0.2, 0.9)
    first = np.maximum(pf["launch"], 0) + 1            # the first day a change can happen
    span = np.maximum(span_days - first, 0)
    matched = np.isin(pf["child"], PRICE_MATCHED["children"])
    counts = rng.poisson(np.where(matched, PRICE_MATCHED["changes"], PRICE_CHANGES_PER_PRODUCT) * span / span_days)
    sigma = np.where(matched, PRICE_MATCHED["sigma"], PRICE_STEP_SIGMA)
    reversion = np.where(matched, PRICE_MATCHED["reversion"], PRICE_REVERSION)
    draws = []
    for i in range(n):
        k = int(min(counts[i], span[i]))
        when = np.sort(rng.choice(span[i], size=k, replace=False)) + first[i] if k else np.array([], dtype=int)
        draws.append((when, rng.normal(0.0, sigma[i], k)))

    # Overwrites after the draws, so no stream shifts.
    ids = np.arange(1, n + 1)
    thin = np.isin(pf["child"], THIN_MARGIN_CHILDREN)
    gifts = is_gift(pf)
    share[thin] = THIN_MARGIN_COST_SHARE + 0.01 * (ids[thin] % 5)
    promos = {r["promo_id"]: r for r in promotions.to_pylist()}
    frozen: dict[int, list[tuple[int, int]]] = {}
    for promo_id, pid in zip(promo_products.column("promo_id").to_pylist(), promo_products.column("product_id").to_pylist()):
        p = promos[promo_id]
        if p["promo_code"] in PLANTED_PROMOS:
            lo, hi = p["start_date"] - PLANT_PRICE_FREEZE[0], p["end_date"] + PLANT_PRICE_FREEZE[1]
            frozen.setdefault(pid, []).append((day_of(lo), day_of(hi)))

    def thin_floor(i: int, cents: int) -> int:
        while thin[i] and pf["cost"][i] <= THIN_MARGIN_FLOOR * cents:
            cents -= price_step(cents)
        return cents

    rows = []
    for i in range(n):
        pid = i + 1
        if pid in PLANTED_LIST_PRICES:
            periods = [(0, int(Decimal(PLANTED_LIST_PRICES[pid]) * 100))]
        else:
            base = thin_floor(i, retail_cents(pf["cost"][i] / share[i]))
            periods = [(0, base)]
            last_day = -MIN_CHANGE_GAP_DAYS
            level = 0.0                                # log of the price factor against the launch price
            for day, noise in zip(*draws[i]):
                day = int(day)
                date = WINDOW_START + dt.timedelta(day)
                if (day - last_day < MIN_CHANGE_GAP_DAYS or any(lo <= day <= hi for lo, hi in frozen.get(pid, []))
                        or (gifts[i] and gift_quiet(date, date))):
                    continue
                prev = periods[-1][1]
                level += float(np.clip(noise - reversion[i] * level, -MAX_PRICE_STEP, MAX_PRICE_STEP))
                new = retail_cents(base * np.exp(level))
                while new > MAX_RANDOM_RISE * prev:
                    new -= price_step(new)
                new = thin_floor(i, new)
                if new != prev:
                    periods.append((day, new))
                    last_day = day
            if pid in FAKE_RAISES:                     # FIND-01-08: raised before the promotion, back after it
                code, before, rise = FAKE_RAISES[pid]
                start, end = d(PLANTED_PROMOS[code][2]), d(PLANTED_PROMOS[code][3])
                up, back = day_of(start) - before, day_of(end) + 1
                prev = [c for day, c in periods if day < up][-1]
                raised = retail_cents(prev * rise)
                while raised < 1.10 * prev:
                    raised += price_step(raised)
                while raised > 1.20 * prev:
                    raised -= price_step(raised)
                periods = sorted([x for x in periods if not up <= x[0] <= back] + [(up, raised), (back, prev)])
        launch = pf["launch_date"][i]
        starts = [launch] + [WINDOW_START + dt.timedelta(day) for day, _ in periods[1:]]
        for k, (start, (_, cents)) in enumerate(zip(starts, periods)):
            end = starts[k + 1] - dt.timedelta(1) if k + 1 < len(starts) else None
            rows.append((pid, start, end, cents))
    return pa.table({
        "product_id": pa.array([r[0] for r in rows], pa.int32()),
        "valid_from": pa.array([r[1] for r in rows], pa.date32()),
        "valid_to": pa.array([r[2] for r in rows], pa.date32()),
        "list_price_eur": decimal_array(np.array([r[3] for r in rows], dtype=np.int64)),
    })


def daily_prices(price_history: pa.Table, n: int) -> np.ndarray:
    """List price in cents per window day and product (rows: days, columns: product_id - 1)."""
    days = (WINDOW_END - WINDOW_START).days + 1
    price = np.zeros((days, n), dtype=np.int64)
    cents = (price_history.column("list_price_eur").cast(pa.float64()).to_numpy() * 100).round().astype(np.int64)
    for pid, start, end, c in zip(price_history.column("product_id").to_pylist(), price_history.column("valid_from").to_pylist(),
                                  price_history.column("valid_to").to_pylist(), cents):
        lo, hi = max(day_of(start), 0), days - 1 if end is None else min(day_of(end), days - 1)
        if lo <= hi:
            price[lo:hi + 1, pid - 1] = c
    return price


def daily_promotions(promotions: pa.Table, promo_products: pa.Table, n: int) -> tuple[np.ndarray, np.ndarray]:
    """The deepest active promotion per window day and product: (discount in basis points, promo_id or 0)."""
    days = (WINDOW_END - WINDOW_START).days + 1
    pct = np.zeros((days, n), dtype=np.int64)
    which = np.zeros((days, n), dtype=np.int64)
    promos = {r["promo_id"]: r for r in promotions.to_pylist()}
    for promo_id, pid in zip(promo_products.column("promo_id").to_pylist(), promo_products.column("product_id").to_pylist()):
        p = promos[promo_id]
        lo, hi = max(day_of(p["start_date"]), 0), min(day_of(p["end_date"]), days - 1)
        bp = int(p["discount_pct"] * 100)
        seg = pct[lo:hi + 1, pid - 1]
        deeper = bp > seg
        seg[deeper] = bp
        which[lo:hi + 1, pid - 1][deeper] = promo_id
    return pct, which


def day_factors(days: list[dt.date]) -> np.ndarray:
    """Order volume per day for (store, web): month, Black Week, Christmas and New Year (05 DIST-08)."""
    f = np.array([[MONTH_FACTOR[x.month - 1]] * 2 for x in days])
    (m0, d0), (m1, d1), run = CHRISTMAS_RUN
    for k, x in enumerate(days):
        if (m0, d0) <= (x.month, x.day) <= (m1, d1):
            f[k] *= run
        if (x.month, x.day) in HOLIDAYS:
            f[k] *= HOLIDAYS[(x.month, x.day)]
        for first, last in BLACK_WEEK.values():
            if d(first) <= x <= d(last):
                event = EVENTS.get(x.isoformat())
                table = {"black_friday": BLACK_FRIDAY_FACTOR, "cyber_monday": CYBER_MONDAY_FACTOR}.get(event, BLACK_WEEK_FACTOR)
                f[k] *= (table["store"], table["web"])
    return f


def build_orders(r: dict, pf: dict, demand: np.ndarray, stores: pa.Table, promotions: pa.Table,
                 promo_products: pa.Table, price_history: pa.Table) -> tuple[pa.Table, pa.Table]:
    """Orders and their lines: daily demand per product, orders per store and day, baskets of 1 + Poisson(0.6)."""
    n = len(pf["child"])
    days = window_days()
    nd = len(days)
    child, parent = pf["child"], pf["parent"]
    price = daily_prices(price_history, n)
    pct, promo_of = daily_promotions(promotions, promo_products, n)
    promos = {p["promo_code"]: p for p in promotions.to_pylist()}

    # Demand multipliers per day and product: launched, list price (elasticity), promotion lift, plants.
    launched = np.arange(nd)[:, None] >= pf["launch"][None, :]
    list0 = price[np.maximum(pf["launch"], 0), np.arange(n)].astype(float)
    elasticity = np.array([ELASTICITY.get(c, PARENT_ELASTICITY[p]) for c, p in zip(child, parent)])
    lift = np.where(pct > 0, np.minimum((1 - pct / 10000.0) ** PROMO_ELASTICITY, PROMO_LIFT_CAP), 1.0)
    ratio = np.where(launched, price / list0[None, :], 1.0)    # no price before launch
    mult = launched * ratio ** elasticity[None, :] * lift
    c = CANNIBALISATION
    p = promos[c["promo"]]
    lo, hi = day_of(p["start_date"]), day_of(p["end_date"])
    extra = lift[lo:hi + 1, c["from"] - 1] - 1
    mult[lo:hi + 1, c["to"] - 1] *= 1 - c["share"] * extra * demand[c["from"] - 1] / demand[c["to"] - 1]
    p = promos[POST_PROMO_DIP["promo"]]
    dipped = [pid - 1 for promo_id, pid in zip(promo_products.column("promo_id").to_pylist(),
                                                promo_products.column("product_id").to_pylist()) if promo_id == p["promo_id"]]
    after = day_of(p["end_date"]) + 1
    mult[after:after + POST_PROMO_DIP["days"], dipped] *= POST_PROMO_DIP["factor"]
    mult[day_of(d(STOCKOUT["start"])):day_of(d(STOCKOUT["end"])) + 1, STOCKOUT["product_id"] - 1] = 0.0
    weighted = mult * demand[None, :]
    reference = (launched * demand[None, :]).sum(axis=1)

    # Country and channel effects: Sinterklaas gifts by ship-to country, Cyber Monday computing on the web.
    gift = is_gift(pf)
    computing = parent == "Computing"
    gift_factor = np.ones((nd, len(COUNTRIES)))
    for k, x in enumerate(days):
        for (m0, d0), (m1, d1), factors in ((*SINTERKLAAS, SINTERKLAAS_FACTOR), (*AFTER_SINTERKLAAS, AFTER_SINTERKLAAS_FACTOR)):
            if (m0, d0) <= (x.month, x.day) <= (m1, d1):
                gift_factor[k] = [factors[cc] for cc in COUNTRIES]
    computing_factor = np.ones((nd, 2))
    for k, x in enumerate(days):
        if EVENTS.get(x.isoformat()) == "cyber_monday":
            computing_factor[k, 1] = CYBER_MONDAY_COMPUTING
    total = weighted.sum(axis=1)
    gifts = weighted[:, gift].sum(axis=1)
    comps = weighted[:, computing].sum(axis=1)
    level = ((total[:, None, None] + (gift_factor[:, :, None] - 1) * gifts[:, None, None]
              + (computing_factor[:, None, :] - 1) * comps[:, None, None]) / reference[:, None, None])

    # Outlets: each physical store, then the webshop once per ship-to country (E-016).
    outlets = []
    for s in stores.to_pylist():
        if s["store_id"] != 99:
            size = STORE_SIZE[s["store_type"]] * COUNTRY_STORE_SIZE.get(s["country_code"], 1.0) * STORE_LINES_PER_DAY
            outlets.append((s["store_id"], COUNTRIES.index(s["country_code"]), 0, size, s["opened_on"], s["close_date"]))
    for k, mix in enumerate(WEB_COUNTRY_MIX):
        outlets.append((99, k, 1, mix * WEB_LINES_PER_DAY, None, None))
    weekday = np.array([x.weekday() for x in days])
    season = day_factors(days)
    lines_per_day = np.zeros((nd, len(outlets)))
    for o, (_, country, channel, size, opened, closed) in enumerate(outlets):
        week = np.array(WEB_WEEKDAY if channel else STORE_WEEKDAY)[weekday]
        open_ = np.array([(opened is None or x >= opened) and (closed is None or x <= closed) for x in days])
        lines_per_day[:, o] = size * week * season[:, channel] * open_ * level[:, country, channel]
    country_of = np.array([o[1] for o in outlets])
    channel_of = np.array([o[2] for o in outlets])
    store_of = np.array([o[0] for o in outlets])

    # Orders (orders stream): count per day and outlet, basket size, time of day, customer.
    rng = r["orders"]
    counts = rng.poisson(lines_per_day / LINES_PER_ORDER)
    cell = np.repeat(np.arange(counts.size), counts.ravel())
    o_day, o_outlet = cell // len(outlets), cell % len(outlets)
    n_orders = len(cell)
    basket = 1 + rng.poisson(BASKET_EXTRA, n_orders)
    u_hour = rng.random(n_orders)
    minute = rng.integers(0, 60, n_orders)
    second = rng.integers(0, 60, n_orders)
    guest = rng.random(n_orders) < GUEST_SHARE
    u_customer = rng.random(n_orders)
    hour = np.zeros(n_orders, dtype=np.int64)
    web = channel_of[o_outlet] == 1
    sunday = weekday[o_day] == 6
    for mask, profile in ((web, WEB_HOURS), (~web & sunday, SUNDAY_HOURS), (~web & ~sunday, STORE_HOURS)):
        hours, weights = np.array(list(profile)), np.array(list(profile.values()))
        cdf = np.cumsum(weights) / weights.sum()
        hour[mask] = hours[np.minimum(np.searchsorted(cdf, u_hour[mask], side="right"), len(hours) - 1)]
    home = customer_countries(r["customers"])
    customer = np.full(n_orders, -1, dtype=np.int64)
    o_country = country_of[o_outlet]
    for k in range(len(COUNTRIES)):
        pool = np.flatnonzero(home == k) + 1
        m = (o_country == k) & ~guest
        customer[m] = pool[(u_customer[m] * len(pool)).astype(np.int64)]

    # Lines (order_lines stream): a product per line from that day's demand in the order's country and channel.
    rng = r["order_lines"]
    line_order = np.repeat(np.arange(n_orders), basket)
    group = ((o_day * len(COUNTRIES) + o_country) * 2 + channel_of[o_outlet])[line_order]
    u = rng.random(len(line_order))
    product = np.empty(len(line_order), dtype=np.int64)
    by_group = np.argsort(group, kind="stable")
    sorted_groups = group[by_group]
    starts = np.flatnonzero(np.r_[True, sorted_groups[1:] != sorted_groups[:-1]])
    for a, b in zip(starts, np.r_[starts[1:], len(sorted_groups)]):
        g = int(sorted_groups[a])
        k, country, channel = g // (2 * len(COUNTRIES)), (g // 2) % len(COUNTRIES), g % 2
        w = weighted[k] * np.where(gift, gift_factor[k, country], 1.0) * np.where(computing, computing_factor[k, channel], 1.0)
        cdf = np.cumsum(w)
        cdf /= cdf[-1]
        product[by_group[a:b]] = np.minimum(np.searchsorted(cdf, u[by_group[a:b]], side="right"), np.flatnonzero(w > 0)[-1])
    quantity = np.minimum(1 + rng.poisson(np.array([MULTI_UNIT.get(c, 0.0) for c in child])[product]), MAX_QUANTITY)
    # A product drawn twice in one basket is one line with both quantities (FIND-01-13 treats repeats as POS duplicates).
    _, first, inverse = np.unique(line_order * n + product, return_index=True, return_inverse=True)
    summed = np.bincount(inverse, weights=quantity).astype(np.int64)
    keep = np.argsort(first, kind="stable")
    line_order, product, quantity = line_order[first[keep]], product[first[keep]], summed[keep]
    # FIND-01-07: orders with a TV on promotion add a soundbar more often.
    tv = np.isin(child, HALO["tv_children"])
    bars = np.flatnonzero(child == HALO["child"])
    line_day = o_day[line_order]
    candidates = np.unique(line_order[tv[product] & (promo_of[line_day, product] > 0)])
    has_bar = np.zeros(n_orders, dtype=bool)
    has_bar[line_order[child[product] == HALO["child"]]] = True
    u_attach, u_bar = rng.random(len(candidates)), rng.random(len(candidates))
    chosen = (u_attach < HALO["attach"]) & ~has_bar[candidates]
    added = []
    for order, ub in zip(candidates[chosen], u_bar[chosen]):
        w = weighted[o_day[order], bars]
        cdf = np.cumsum(w) / w.sum()
        added.append(bars[min(int(np.searchsorted(cdf, ub, side="right")), len(bars) - 1)])
    line_order = np.r_[line_order, candidates[chosen]]
    product = np.r_[product, np.array(added, dtype=np.int64)]
    quantity = np.r_[quantity, np.ones(len(added), dtype=np.int64)]

    # Keys: orders numbered in time order, lines numbered within their order.
    epoch = (WINDOW_START - dt.date(1970, 1, 1)).days
    seconds = (epoch + o_day) * 86400 + hour * 3600 + minute * 60 + second
    rank = np.argsort(seconds, kind="stable")
    order_id = np.empty(n_orders, dtype=np.int64)
    order_id[rank] = np.arange(1, n_orders + 1)
    order_of_line = order_id[line_order]
    perm = np.lexsort((np.arange(len(line_order)), order_of_line))
    line_order, product, quantity = line_order[perm], product[perm], quantity[perm]
    line_day = o_day[line_order]
    unit = price[line_day, product]
    bp = pct[line_day, product]
    promo_id = promo_of[line_day, product]
    discount = (quantity * unit * bp + 5000) // 10000   # half up, in cents (E-103)

    orders = pa.table({
        "order_id": pa.array(np.arange(1, n_orders + 1), pa.int64()),
        "customer_id": pa.array(customer[rank], pa.int64(), mask=customer[rank] < 0),
        "store_id": pa.array(store_of[o_outlet[rank]], pa.int32()),
        "order_ts": pa.array((seconds[rank] * 1_000_000).astype("datetime64[us]"), pa.timestamp("us")),
        "channel": pa.array(np.array(["store", "web"])[channel_of[o_outlet[rank]]]),
        "ship_to_country": pa.array(np.array(COUNTRIES)[o_country[rank]]),
    })
    order_lines = pa.table({
        "order_line_id": pa.array(np.arange(1, len(line_order) + 1), pa.int64()),
        "order_id": pa.array(order_id[line_order], pa.int64()),
        "product_id": pa.array(product + 1, pa.int32()),
        "quantity": pa.array(quantity, pa.int32()),
        "unit_price_eur": decimal_array(unit),
        "promo_id": pa.array(promo_id, pa.int32(), mask=promo_id == 0),
        "line_discount_eur": decimal_array(discount),
    })
    return orders, order_lines


def build_competitor_prices(rng: np.random.Generator, pf: dict, demand: np.ndarray, price_history: pa.Table) -> pa.Table:
    """05 CO-01's competitor_prices: each rival checks its products once a week, on a fixed weekday, from launch on.

    A price follows Voltmarkt's list price on the check date, times the rival's level, the product's offset and
    weekly noise, with occasional runs of undercut weeks; it is held inside COMPETITOR_BAND and ends in 9 like a
    shelf price. Every draw is made in fixed shapes before any data-dependent step, so the stream stays aligned.
    """
    n = len(pf["child"])
    price = daily_prices(price_history, n)
    nd = price.shape[0]
    weeks = (nd + 6) // 7                                  # the window starts on a Monday (2024-01-01)
    epoch = (WINDOW_START - dt.date(1970, 1, 1)).days
    weights = demand ** COMPETITOR_TRACK_POWER
    rows = []                                              # (product_id, competitor, seconds since 1970, cents)
    for name in COMPETITORS:
        k = COMPETITOR_TRACKED[name]
        tracked = np.sort(rng.choice(n, size=k, replace=False, p=weights / weights.sum()))
        weekday = rng.integers(0, 7, k)
        offset = rng.normal(0.0, COMPETITOR_PRODUCT_SIGMA, k)
        noise = rng.normal(0.0, COMPETITOR_WEEK_SIGMA, (k, weeks))
        run_start = rng.random((k, weeks)) < UNDERCUT_START
        run_weeks = rng.integers(*UNDERCUT_WEEKS, (k, weeks))
        run_depth = rng.uniform(*UNDERCUT_DEPTH, (k, weeks))
        hour = rng.integers(*OBSERVED_HOURS, (k, weeks))
        minute = rng.integers(0, 60, (k, weeks))
        second = rng.integers(0, 60, (k, weeks))
        recheck = rng.random((k, weeks)) < RECHECK_SHARE
        recheck_gap = rng.integers(*RECHECK_GAP_HOURS, (k, weeks))
        recheck_noise = rng.normal(0.0, COMPETITOR_WEEK_SIGMA, (k, weeks))
        for j, i in enumerate(tracked):
            left, depth = 0, 1.0
            for w in range(weeks):
                if left == 0 and run_start[j, w]:
                    left, depth = int(run_weeks[j, w]), float(run_depth[j, w])
                mult = depth if left > 0 else 1.0
                left = max(left - 1, 0)
                day = 7 * w + int(weekday[j])
                if day >= nd or day < pf["launch"][i] or price[day, i] <= 0:
                    continue
                at = (epoch + day) * 86400 + int(hour[j, w]) * 3600 + int(minute[j, w]) * 60 + int(second[j, w])
                checks = [(at, noise[j, w])]
                if recheck[j, w]:
                    checks.append((at + int(recheck_gap[j, w]) * 3600, recheck_noise[j, w]))
                for seconds, e in checks:
                    factor = COMPETITOR_LEVEL[name] * np.exp(offset[j] + e) * mult
                    factor = min(max(factor, COMPETITOR_BAND[0]), COMPETITOR_BAND[1])
                    rows.append((int(i) + 1, name, seconds, retail_cents(price[day, i] * factor)))
    rows.sort(key=lambda r: (r[0], r[1], r[2]))
    return pa.table({
        "product_id": pa.array([r[0] for r in rows], pa.int32()),
        "competitor": pa.array([r[1] for r in rows], pa.string()),
        "observed_ts": pa.array((np.array([r[2] for r in rows], dtype=np.int64) * 1_000_000).astype("datetime64[us]"),
                                pa.timestamp("us")),
        "price_eur": decimal_array(np.array([r[3] for r in rows], dtype=np.int64)),
    })


def sinterklaas_days() -> list[dt.date]:
    """E-079: 20 Nov to 5 Dec of each year, without Black Week (the Monday before Black Friday to Cyber Monday)."""
    out = []
    for year, (first, last) in BLACK_WEEK.items():
        (m0, d0), (m1, d1) = SINTERKLAAS
        day = dt.date(year, m0, d0)
        while day <= dt.date(year, m1, d1):
            if not d(first) <= day <= d(last):
                out.append(day)
            day += dt.timedelta(1)
    return out


def generate(seed: int = SEED) -> tuple[dict, dict]:
    r = rngs(seed)
    categories, cat_ids = build_categories()
    clean = {
        "calendar": build_calendar(),
        "stores": build_stores(),
        "categories": categories,
        "products": build_products(r["products"], cat_ids),
        "promotions": build_promotions(r["promotions"]),
    }
    # Slice 1b: the order data, each table from its reserved stream; nothing above is changed.
    pf = product_frame(clean["products"], categories)
    demand = build_demand(r["demand"], pf)
    promo_products = build_promotion_products(r["promotion_products"], clean["promotions"], pf, demand)
    clean["price_history"] = build_price_history(r["price_history"], pf, clean["promotions"], promo_products)
    clean["promotion_products"] = promo_products
    clean["orders"], clean["order_lines"] = build_orders(r, pf, demand, clean["stores"], clean["promotions"],
                                                         promo_products, clean["price_history"])
    # Sprint 4a (S4-02): competitor prices, from their reserved stream, after every other table; nothing above changes.
    clean["competitor_prices"] = build_competitor_prices(r["competitor_prices"], pf, demand, clean["price_history"])
    raw = dict(clean)
    raw["products"] = inject_product_quirks(r["quirks"], clean["products"])
    truth = {
        "company": "voltmarkt", "seed": seed, "as_of_date": "2026-01-05",
        "planted_products": {str(k): v[0] for k, v in PLANTED_PRODUCTS.items()},
        "planted_promos": {k: {"start": v[2], "end": v[3], "discount_pct": v[4]} for k, v in PLANTED_PROMOS.items()},
        # Built from STORES: stores opened inside the data window, and every store with a close date.
        "store_openings": {s[0]: s[5] for s in STORES if WINDOW_START <= d(s[5]) <= WINDOW_END},
        "store_closures": {s[0]: s[6] for s in STORES if s[6] is not None},
        # Slice 1b plants (GEN-03). The measured answers are added by the build as "findings".
        "planted": {
            "planted_list_prices": {str(k): v for k, v in PLANTED_LIST_PRICES.items()},
            "black_week": {str(y): {"start": a, "end": b} for y, (a, b) in BLACK_WEEK.items()},
            "sinterklaas_days": [x.isoformat() for x in sinterklaas_days()],
            "gift_categories": {"parents": list(GIFT_PARENTS), "children": list(GIFT_CHILDREN)},
            "cannibalisation": CANNIBALISATION,
            "lite_over_pro_x": PLANTED_DEMAND[312] / PLANTED_DEMAND[311],
            "post_promo_dip": POST_PROMO_DIP,
            "fake_raises": {str(k): {"promo": v[0], "days_before": v[1], "rise": v[2]} for k, v in FAKE_RAISES.items()},
            "thin_margin_children": list(THIN_MARGIN_CHILDREN),
            "stockout": STOCKOUT,
            "elasticity": {"Laptops": ELASTICITY["Laptops"], "Cables": ELASTICITY["Cables"], "promo": PROMO_ELASTICITY},
            # Sprint 4a. FIND-01-15 (units fall when a rival undercuts) is not planted: the orders were drawn before
            # these prices and may not change (S4-02), so the measured gap is whatever the data holds.
            "competitor_prices": {"competitors": list(COMPETITORS), "levels": COMPETITOR_LEVEL,
                                  "undercut_depth": list(UNDERCUT_DEPTH), "band": list(COMPETITOR_BAND)},
        },
    }
    return {"clean": clean, "raw": raw}, truth


def _check(ok: bool, message: str) -> None:
    if not ok:
        raise ValueError(message)


LINES_SQL = """CREATE TEMP VIEW l AS
    SELECT ol.*, o.store_id, o.channel, o.ship_to_country, CAST(o.order_ts AS DATE) AS d,
           c.category_name, c.parent_category, p.unit_cost_eur,
           ol.quantity * ol.unit_price_eur - ol.line_discount_eur AS net
    FROM order_lines ol JOIN orders o USING (order_id) JOIN products p USING (product_id)
    JOIN categories c USING (category_id)"""


def measure(clean: dict) -> dict:
    """The order data's integrity counts and planted findings, computed in SQL on the clean tables (E-093)."""
    con = duckdb.connect(config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    try:
        for name, table in clean.items():
            con.register(name, table)
        con.execute(LINES_SQL)

        def one(sql: str):
            return con.execute(sql).fetchone()

        def rows(sql: str):
            return con.execute(sql).fetchall()

        days = ", ".join(f"DATE '{x.isoformat()}'" for x in sinterklaas_days())
        gifts = (f"(parent_category IN ({', '.join(repr(p) for p in GIFT_PARENTS)}) "
                 f"OR category_name IN ({', '.join(repr(c) for c in GIFT_CHILDREN)})) AND product_id <> {STOCKOUT['product_id']}")
        promos = {p["promo_code"]: p for p in clean["promotions"].to_pylist()}
        m: dict = {"integrity": {
            "ship_to_outside_benelux": one("SELECT count(*) FROM orders WHERE ship_to_country IS NULL OR ship_to_country NOT IN ('NL', 'BE', 'LU')")[0],
            "store_orders_shipped_abroad": one("""SELECT count(*) FROM orders o JOIN stores s USING (store_id)
                                                 WHERE o.channel = 'store' AND o.ship_to_country <> s.country_code""")[0],
            "orders_while_store_closed": one("""SELECT count(*) FROM orders o JOIN stores s USING (store_id)
                WHERE CAST(o.order_ts AS DATE) < s.opened_on OR CAST(o.order_ts AS DATE) > s.close_date""")[0],
            "lines_off_list_price": one("""SELECT count(*) FROM l WHERE NOT EXISTS (SELECT 1 FROM price_history ph
                WHERE ph.product_id = l.product_id AND l.d >= ph.valid_from AND (ph.valid_to IS NULL OR l.d <= ph.valid_to)
                AND ph.list_price_eur = l.unit_price_eur)""")[0],
            "lines_off_promotion": one("""SELECT count(*) FROM l LEFT JOIN promotions pr USING (promo_id)
                WHERE (l.promo_id IS NULL AND l.line_discount_eur <> 0)
                   OR (l.promo_id IS NOT NULL AND (l.d NOT BETWEEN pr.start_date AND pr.end_date
                       OR abs(l.line_discount_eur * 100 - l.quantity * l.unit_price_eur * pr.discount_pct) > 0.5))""")[0],
            "lines_before_launch": one("SELECT count(*) FROM l JOIN products p USING (product_id) WHERE l.d < p.launch_date")[0],
        }}
        lines, orders = clean["order_lines"].num_rows, clean["orders"].num_rows
        m["E-105"] = {"order_lines": lines, "orders": orders, "lines_per_order": round(lines / orders, 4)}
        m["E-147"] = {
            "top_revenue_parent": one("SELECT parent_category FROM l GROUP BY 1 ORDER BY sum(net) DESC LIMIT 1")[0],
            "top_units_parent": one("SELECT parent_category FROM l GROUP BY 1 ORDER BY sum(quantity) DESC LIMIT 1")[0],
        }
        m["FIND-01-01"] = {
            "web_share": round(float(one("SELECT sum(net) FILTER (WHERE channel = 'web') / sum(net) FROM l")[0]), 4),
            "revenue_by_country": {c: str(v) for c, v in rows("SELECT ship_to_country, sum(net) FROM l GROUP BY 1 ORDER BY 2 DESC")},
        }
        ratio = dict(rows(f"""SELECT ship_to_country, (sum(net) FILTER (WHERE d IN ({days})) / {len(sinterklaas_days())})
                / (sum(net) FILTER (WHERE month(d) = 10) / 62) FROM l WHERE {gifts} GROUP BY 1"""))
        drop = {}
        for year in BLACK_WEEK:
            d5, d6 = one(f"""SELECT sum(net) FILTER (WHERE d = DATE '{year}-12-05'), sum(net) FILTER (WHERE d = DATE '{year}-12-06')
                             FROM l WHERE {gifts} AND ship_to_country IN ('NL', 'BE')""")
            drop[str(year)] = round(float(d6 / d5), 4)
        m["FIND-01-04"] = {"ratio_by_country": {k: round(float(v), 4) for k, v in ratio.items()}, "dec6_over_dec5": drop}
        p = promos[CANNIBALISATION["promo"]]
        start, end = p["start_date"], p["end_date"]
        weekly = {}
        for key, where in (("pro_x", f"product_id = {CANNIBALISATION['from']}"), ("lite", f"product_id = {CANNIBALISATION['to']}"),
                           ("earbuds", "category_name = 'Earbuds'")):
            before, during = one(f"""SELECT sum(quantity) FILTER (WHERE d BETWEEN DATE '{start - dt.timedelta(28)}' AND DATE '{start - dt.timedelta(1)}') / 4,
                                            sum(quantity) FILTER (WHERE d BETWEEN DATE '{start}' AND DATE '{end}') / 2
                                     FROM l WHERE {where}""")
            weekly[key] = (float(before), float(during))
        m["FIND-01-05"] = {k: round(v[1] / v[0], 4) for k, v in weekly.items()}
        m["FIND-01-05"]["lite_over_pro_x_before"] = round(weekly["lite"][0] / weekly["pro_x"][0], 4)
        raised = rows("""WITH ph AS (SELECT *, lag(list_price_eur) OVER (PARTITION BY product_id ORDER BY valid_from) AS prev
                                     FROM price_history)
            SELECT DISTINCT ph.product_id, ph.list_price_eur / ph.prev
            FROM ph JOIN promotion_products pp USING (product_id) JOIN promotions pr USING (promo_id)
            WHERE ph.list_price_eur >= 1.10 * ph.prev AND ph.valid_from BETWEEN pr.start_date - INTERVAL 14 DAY AND pr.start_date
            ORDER BY 1""")
        m["FIND-01-08"] = {"products": [r[0] for r in raised], "max_rise": round(max((float(r[1]) for r in raised), default=0.0), 4)}
        m["FIND-01-09"] = {"lines_in_stockout": one(f"""SELECT count(*) FROM l WHERE product_id = {STOCKOUT['product_id']}
                                                        AND d BETWEEN DATE '{STOCKOUT['start']}' AND DATE '{STOCKOUT['end']}'""")[0]}
        # E-014: weekly ln(units) on ln(list price) after removing each SKU's own means, per category, over the
        # SKUs sold in at least ELASTICITY_MIN_WEEKS weeks.
        slopes = rows(f"""WITH w AS (SELECT product_id, category_name, date_trunc('week', d) AS wk,
                                            ln(sum(quantity)) AS y, ln(avg(unit_price_eur)) AS x
                                     FROM l WHERE category_name IN ('Laptops', 'Cables') GROUP BY ALL),
                               k AS (SELECT product_id FROM w GROUP BY 1 HAVING count(*) >= {ELASTICITY_MIN_WEEKS}),
                               c AS (SELECT category_name, product_id, y - avg(y) OVER (PARTITION BY product_id) AS yc,
                                            x - avg(x) OVER (PARTITION BY product_id) AS xc
                                     FROM w WHERE product_id IN (SELECT product_id FROM k))
                          SELECT category_name, regr_slope(yc, xc), count(DISTINCT product_id) FROM c GROUP BY 1 ORDER BY 1""")
        m["FIND-01-11"] = {c: {"within_sku_slope": round(float(v), 4), "skus": k} for c, v, k in slopes}
        m["FIND-01-12"] = {"negative_margin_lines": one(f"""SELECT count(*) FROM l JOIN promotions pr USING (promo_id)
            WHERE l.parent_category = 'Accessories' AND pr.discount_pct >= {DEEP_PROMO_PCT}
              AND l.net - l.quantity * l.unit_cost_eur < 0""")[0]}
        # The other order-shaped plants of 05's model, measured for the truth file.
        black = {}
        for year, (first, last) in BLACK_WEEK.items():
            share, cm, bf = one(f"""SELECT sum(net) FILTER (WHERE d BETWEEN DATE '{first}' AND DATE '{last}') / sum(net),
                    sum(net) FILTER (WHERE d = DATE '{last}' AND channel = 'web' AND category_name = 'Laptops'),
                    sum(net) FILTER (WHERE d = DATE '{last}' - INTERVAL 3 DAY AND channel = 'web' AND category_name = 'Laptops')
                FROM l WHERE year(d) = {year} AND month(d) IN (11, 12)""")
            black[str(year)] = {"black_week_share": round(float(share), 4), "cyber_over_black_friday_web_laptops": round(float(cm / bf), 4)}
        m["FIND-01-03"] = black
        p = promos[POST_PROMO_DIP["promo"]]
        start, end = p["start_date"], p["end_date"]
        before, after = one(f"""SELECT sum(quantity) FILTER (WHERE d BETWEEN DATE '{start - dt.timedelta(28)}' AND DATE '{start - dt.timedelta(1)}') / 4,
                                       sum(quantity) FILTER (WHERE d BETWEEN DATE '{end + dt.timedelta(1)}' AND DATE '{end + dt.timedelta(14)}') / 2
                                FROM l WHERE product_id IN (SELECT product_id FROM promotion_products WHERE promo_id = {p['promo_id']})""")
        m["FIND-01-06"] = {"post_over_baseline": round(float(after / before), 4)}
        tvs = ", ".join(repr(c) for c in HALO["tv_children"])
        promo_rate, plain_rate = one(f"""WITH o AS (SELECT order_id,
                bool_or(category_name IN ({tvs}) AND promo_id IS NOT NULL) AS promo_tv,
                bool_or(category_name = '{HALO['child']}') AS bar
              FROM l GROUP BY 1 HAVING bool_or(category_name IN ({tvs})))
            SELECT avg(CASE WHEN bar THEN 1 ELSE 0 END) FILTER (WHERE promo_tv),
                   avg(CASE WHEN bar THEN 1 ELSE 0 END) FILTER (WHERE NOT promo_tv) FROM o""")
        m["FIND-01-07"] = {"attach_promo_tv": round(float(promo_rate), 4), "attach_other_tv": round(float(plain_rate), 4),
                           "ratio": round(float(promo_rate / plain_rate), 4)}
        top, bottom = one("""WITH r AS (SELECT product_id, sum(net) AS rev FROM l GROUP BY 1),
                                  k AS (SELECT rev, row_number() OVER (ORDER BY rev DESC, product_id) AS rn, count(*) OVER () AS n FROM r)
                             SELECT sum(rev) FILTER (WHERE rn <= n * 0.2) / sum(rev), sum(rev) FILTER (WHERE rn > n * 0.5) / sum(rev) FROM k""")
        m["FIND-01-10"] = {"top_20_share": round(float(top), 4), "bottom_50_share": round(float(bottom), 4)}
        return m
    finally:
        con.close()


def validate_orders(tables: dict) -> dict:
    """The generator assertions of the ERRATA rows with Slice = 1b, and FIND-01-12 (GEN-01, GEN-06 on clean data)."""
    m = measure(tables["clean"])
    i = m["integrity"]
    _check(i["ship_to_outside_benelux"] == 0, f"E-016: {i['ship_to_outside_benelux']} orders ship outside NL, BE and LU")
    _check(i["store_orders_shipped_abroad"] == 0, f"E-016: {i['store_orders_shipped_abroad']} store orders ship outside their store's country")
    _check(i["orders_while_store_closed"] == 0, f"{i['orders_while_store_closed']} store orders fall outside the store's open period")
    _check(i["lines_off_list_price"] == 0, f"E-103: {i['lines_off_list_price']} lines are not at the list price of their order date")
    _check(i["lines_off_promotion"] == 0, f"E-103: {i['lines_off_promotion']} line discounts do not match their promotion")
    _check(i["lines_before_launch"] == 0, f"{i['lines_before_launch']} lines sell a product before its launch date")
    e105 = m["E-105"]
    _check(912_000 <= e105["order_lines"] <= 1_008_000, f"E-105: {e105['order_lines']} order lines, expected about 960,000")
    _check(1.5 <= e105["lines_per_order"] <= 1.7, f"E-105: {e105['lines_per_order']} lines per order, the basket model gives 1.6")
    e147 = m["E-147"]
    _check(e147["top_revenue_parent"] == "TV & Video", f"E-147: the top revenue parent category is {e147['top_revenue_parent']!r}")
    _check(e147["top_units_parent"] == "Accessories", f"E-147: the top units parent category is {e147['top_units_parent']!r}")
    f01 = m["FIND-01-01"]
    by_country = {k: Decimal(v) for k, v in f01["revenue_by_country"].items()}
    _check(0.34 <= f01["web_share"] <= 0.42, f"FIND-01-01 (E-093): web share of revenue {f01['web_share']}")
    _check(by_country.get("NL", 0) > by_country.get("BE", 0) > by_country.get("LU", 0), f"FIND-01-01: revenue by country {by_country}")
    f04 = m["FIND-01-04"]
    r = f04["ratio_by_country"]
    _check(1.4 <= r.get("NL", 0) <= 1.8 and 1.4 <= r.get("BE", 0) <= 1.8 and r.get("LU", 9) < 1.25,
           f"FIND-01-04 (E-079): gift revenue ratios against October {r}")
    _check(all(v < 0.7 for v in f04["dec6_over_dec5"].values()), f"FIND-01-04 (E-079): 6 Dec against 5 Dec {f04['dec6_over_dec5']}")
    f05 = m["FIND-01-05"]
    _check(f05["pro_x"] >= 2.2 and 0.5 <= f05["lite"] <= 0.7 and 1.05 <= f05["earbuds"] <= 1.25,
           f"FIND-01-05 (E-094): promotion week ratios {f05}")
    f08 = m["FIND-01-08"]
    _check(f08["products"] == sorted(FAKE_RAISES) and f08["max_rise"] <= 1.21,
           f"FIND-01-08 (E-093): products with a 10% rise before a promotion {f08}")
    _check(m["FIND-01-09"]["lines_in_stockout"] == 0, f"FIND-01-09: {m['FIND-01-09']['lines_in_stockout']} lines during the stockout")
    f11 = m["FIND-01-11"]
    laptops, cables = f11.get("Laptops", {}), f11.get("Cables", {})
    _check(laptops.get("skus", 0) >= 5 and -3.0 <= laptops.get("within_sku_slope", 0) <= -2.2,
           f"FIND-01-11 (E-014): laptop within-SKU slope {laptops}")
    _check(cables.get("skus", 0) >= 5 and -1.1 <= cables.get("within_sku_slope", 0) <= -0.5,
           f"FIND-01-11 (E-014): cable within-SKU slope {cables}")
    _check(m["FIND-01-12"]["negative_margin_lines"] > 500, f"FIND-01-12: {m['FIND-01-12']['negative_margin_lines']} negative margin lines")
    # 05's other order-shaped plants that this build makes. FIND-01-06 and FIND-01-10 are measured into the
    # truth file but not asserted: see the slice 1b report (FIND-01-10 does not fit 05's band at 05's Zipf b).
    for year, v in m["FIND-01-03"].items():
        _check(v["black_week_share"] >= 0.22 and v["cyber_over_black_friday_web_laptops"] > 1,
               f"FIND-01-03: Black Week in {year} {v}")
    _check(m["FIND-01-07"]["ratio"] >= 2.5, f"FIND-01-07: soundbar attach ratio {m['FIND-01-07']}")
    return {k: v for k, v in m.items() if k != "integrity"}


def validate_competitor_prices(tables: dict) -> dict:
    """Sprint 4a (S4-02): 05 CO-01's row count, keys and value bands for competitor_prices, measured in SQL."""
    c = tables["clean"]
    con = duckdb.connect(config=NO_NETWORK)
    con.execute("SET TimeZone = 'UTC'")
    try:
        for name in ("competitor_prices", "price_history", "products"):
            con.register(name, c[name])
        rows, keys, missing, orphans, before_launch = con.execute("""SELECT count(*), count(DISTINCT (product_id, competitor, observed_ts)),
                4 * count(*) - count(product_id) - count(competitor) - count(observed_ts) - count(price_eur),
                count(*) FILTER (WHERE product_id NOT IN (SELECT product_id FROM products)),
                count(*) FILTER (WHERE CAST(observed_ts AS DATE) < (SELECT launch_date FROM products p WHERE p.product_id = competitor_prices.product_id))
            FROM competitor_prices""").fetchone()
        names = [r[0] for r in con.execute("SELECT DISTINCT competitor FROM competitor_prices ORDER BY 1").fetchall()]
        first, last = con.execute("SELECT min(CAST(observed_ts AS DATE)), max(CAST(observed_ts AS DATE)) FROM competitor_prices").fetchone()
        matched, low, high, undercut = con.execute("""SELECT count(*), min(r), max(r), avg(CASE WHEN r < 0.95 THEN 1 ELSE 0 END)
            FROM (SELECT c.price_eur / ph.list_price_eur AS r FROM competitor_prices c JOIN price_history ph
                  ON ph.product_id = c.product_id
                 AND CAST(c.observed_ts AS DATE) BETWEEN ph.valid_from AND coalesce(ph.valid_to, DATE '9999-12-31'))""").fetchone()
        medians = dict(con.execute("""SELECT c.competitor, median(c.price_eur / ph.list_price_eur) FROM competitor_prices c
            JOIN price_history ph ON ph.product_id = c.product_id
             AND CAST(c.observed_ts AS DATE) BETWEEN ph.valid_from AND coalesce(ph.valid_to, DATE '9999-12-31') GROUP BY 1""").fetchall())
    finally:
        con.close()
    _check(140_000 <= rows <= 160_000, f"competitor_prices: {rows} rows, 05 CO-01 gives about 150,000")
    _check(names == sorted(COMPETITORS), f"competitor_prices: rivals {names}, expected {sorted(COMPETITORS)}")
    _check(keys == rows, f"competitor_prices: {rows - keys} repeated (product_id, competitor, observed_ts)")
    _check(missing == 0 and orphans == 0, f"competitor_prices: {missing} missing values, {orphans} unknown products")
    _check(before_launch == 0, f"competitor_prices: {before_launch} prices before the product's launch")
    _check(first >= WINDOW_START and last <= WINDOW_END, f"competitor_prices: checks run {first} to {last}")
    _check(matched == rows, f"competitor_prices: {rows - matched} checks meet no single list price version")
    _check(0.75 <= float(low) and float(high) <= 1.25, f"competitor_prices: price against list price runs {low} to {high}")
    _check(0.10 <= float(undercut) <= 0.35, f"competitor_prices: {float(undercut):.3f} of checks undercut by more than 5%")
    return {"rows": rows, "undercut_share": round(float(undercut), 4),
            "median_ratio": {k: round(float(v), 4) for k, v in sorted(medians.items())}}


def validate(tables: dict, truth: dict) -> dict:
    """GEN-06 on clean data (design §10): the v0 facts, then the order data. Returns the measured findings.

    Raises ValueError on the first failed check. Explicit raises, not assert, so `python -O` still checks.
    """
    validate_v0(tables, truth)
    measured = validate_orders(tables)
    measured["competitor_prices"] = validate_competitor_prices(tables)
    return measured


def validate_v0(tables: dict, truth: dict) -> None:
    """The slice 1a checks: counts, unique keys and names, and the planted v0 facts."""
    c = tables["clean"]
    _check(c["stores"].num_rows == 26, f"expected 26 stores including the webshop, got {c['stores'].num_rows}")
    _check(c["categories"].num_rows == 40, f"expected 40 categories, got {c['categories'].num_rows}")
    _check(c["products"].num_rows == 1200, f"expected 1200 products, got {c['products'].num_rows}")
    _check(c["promotions"].num_rows == 60, f"expected 60 promotions, got {c['promotions'].num_rows}")
    _check(len(set(c["products"].column("product_id").to_pylist())) == 1200, "product ids are not unique")
    _check(len(set(c["products"].column("product_name").to_pylist())) == 1200, "product names are not unique")
    products = {r["product_id"]: r for r in c["products"].to_pylist()}
    for pid, name in truth["planted_products"].items():
        _check(products.get(int(pid), {}).get("product_name") == name, f"planted product {pid} is not named {name!r}")
    promos = {r["promo_code"]: r for r in c["promotions"].to_pylist()}
    _check(len(promos) == 60, "promo codes are not unique")
    for code, fact in truth["planted_promos"].items():
        r = promos.get(code)
        _check(r is not None, f"planted promo {code} is missing")
        got = (r["start_date"].isoformat(), r["end_date"].isoformat(), str(r["discount_pct"]))
        _check(got == (fact["start"], fact["end"], fact["discount_pct"]), f"planted promo {code} is {got}, truth says {fact}")
    stores = {r["store_code"]: r for r in c["stores"].to_pylist()}
    for code, opened in truth["store_openings"].items():
        _check(code in stores and stores[code]["opened_on"].isoformat() == opened, f"store {code} does not open on {opened}")
    for code, closed in truth["store_closures"].items():
        got = stores.get(code, {}).get("close_date")
        _check(got is not None and got.isoformat() == closed, f"store {code} does not close on {closed}")

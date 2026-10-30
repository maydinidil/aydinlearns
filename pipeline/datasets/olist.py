"""pipeline/datasets/olist.py: the Brazilian E-Commerce Public Dataset by Olist (DS-RETAIL-01, Olist on Kaggle, CC BY-NC-SA 4.0;
sprint 8 Part 2, Task D1: S8-16, E-213).

The download is Kaggle's archive.zip (a browser may save it as archive (2).zip: prep.py finds the copies), holding nine CSV files.
The registry lists the eight the prep reads, each as one table of schema olist (csvzip.py), every row kept as the source has it and
every column under the source's own name (product_name_lenght included), so public solutions run as written. The ninth file,
olist_geolocation_dataset.csv, is not read: no question uses it, and the registry's label and notes say so (E-213).

  customers                          one row per customer_id: customer_id, customer_unique_id, customer_zip_code_prefix,
                                     customer_city, customer_state, all text
  orders                             one row per order: order_id, customer_id, order_status text; order_purchase_timestamp,
                                     order_approved_at, order_delivered_carrier_date, order_delivered_customer_date,
                                     order_estimated_delivery_date timestamp
  order_items                        one row per item of an order: order_id text; order_item_id integer; product_id, seller_id
                                     text; shipping_limit_date timestamp; price, freight_value double
  order_payments                     one row per payment of an order: order_id text; payment_sequential integer; payment_type
                                     text; payment_installments integer; payment_value double
  order_reviews                      one row per review: review_id, order_id text; review_score integer; review_comment_title,
                                     review_comment_message text; review_creation_date, review_answer_timestamp timestamp
  products                           one row per product: product_id, product_category_name text; the seven sizes integer
  sellers                            one row per seller: seller_id, seller_zip_code_prefix, seller_city, seller_state, all text
  product_category_name_translation  one row per category: product_category_name, product_category_name_english text

IDs and postcode prefixes are text, so a prefix keeps its leading zero and customer_unique_id is never read as a number. Olist gives
each order its own customer_id, so customer_unique_id is what identifies a returning customer (03). Checks, recorded in prep.json:
each key in NOTES has no repeated row, each 1:N link's values are in the table it points to, the customer IDs against the people
behind them, and the orders against 03's count ("100k orders" on the dataset's Kaggle page; a read outside 95,000 to 105,000 warns).
A difference warns and is recorded, and the prep goes on.

Manual steps (E-069): download the zip from the Kaggle page and keep it zipped (the registry's notes).
"""
from __future__ import annotations

import pathlib

from datasets import csvzip
from datasets.notes import fk

DATASET = "Olist"
TABLES = {
    "customers": [("customer_id", "text"), ("customer_unique_id", "text"), ("customer_zip_code_prefix", "text"),
                  ("customer_city", "text"), ("customer_state", "text")],
    "orders": [("order_id", "text"), ("customer_id", "text"), ("order_status", "text"), ("order_purchase_timestamp", "datetime"),
               ("order_approved_at", "datetime"), ("order_delivered_carrier_date", "datetime"),
               ("order_delivered_customer_date", "datetime"), ("order_estimated_delivery_date", "datetime")],
    "order_items": [("order_id", "text"), ("order_item_id", "int"), ("product_id", "text"), ("seller_id", "text"),
                    ("shipping_limit_date", "datetime"), ("price", "float"), ("freight_value", "float")],
    "order_payments": [("order_id", "text"), ("payment_sequential", "int"), ("payment_type", "text"), ("payment_installments", "int"),
                       ("payment_value", "float")],
    "order_reviews": [("review_id", "text"), ("order_id", "text"), ("review_score", "int"), ("review_comment_title", "text"),
                      ("review_comment_message", "text"), ("review_creation_date", "datetime"), ("review_answer_timestamp", "datetime")],
    "products": [("product_id", "text"), ("product_category_name", "text"), ("product_name_lenght", "int"),
                 ("product_description_lenght", "int"), ("product_photos_qty", "int"), ("product_weight_g", "int"),
                 ("product_length_cm", "int"), ("product_height_cm", "int"), ("product_width_cm", "int")],
    "sellers": [("seller_id", "text"), ("seller_zip_code_prefix", "text"), ("seller_city", "text"), ("seller_state", "text")],
    "product_category_name_translation": [("product_category_name", "text"), ("product_category_name_english", "text")],
}
ORDERS_PUBLISHED = 100_000            # 03: "100k orders from 2016 to 2018" (the dataset's Kaggle page)
ORDERS_BAND = (95_000, 105_000)
LENGHT = "The source spells length as lenght, and the column keeps that name so public solutions run as written."
# The schema panel's notes (datasets/notes.py): grain, primary key, 1:N links and a line per column. The edge schema olist_edge
# uses the same. A key or link here is also checked by the prep (csvzip.prepare_tables).
NOTES = {
    "customers": ("one row per customer_id: Olist gives every order its own customer_id", ["customer_id"], [], {
        "customer_id": "The customer's ID for one order. Every order has its own, so a person who orders twice has two customer_ids.",
        "customer_unique_id": "The person behind the order: the same ID on every order they place. Count a returning customer on this "
                              "ID, which is text.",
        "customer_zip_code_prefix": "The first digits of the customer's postcode, as text.",
        "customer_city": "The customer's city.",
        "customer_state": "The customer's state, as a two-letter code.",
    }),
    "orders": ("one row per order", ["order_id"], [fk("customer_id", "customers", "customer_id")], {
        "order_id": "The order's ID.",
        "customer_id": "The customer's ID for this order. Join it to customers.customer_id, then use customer_unique_id to follow a "
                       "person across orders.",
        "order_status": "Where the order stands, such as delivered, shipped or canceled.",
        "order_purchase_timestamp": "When the customer placed the order.",
        "order_approved_at": "When the payment was approved; missing when it never was.",
        "order_delivered_carrier_date": "When the seller handed the order to the carrier; missing when that never happened.",
        "order_delivered_customer_date": "When the customer received the order; missing on an order that was never delivered.",
        "order_estimated_delivery_date": "The delivery date the customer was promised when buying.",
    }),
    "order_items": ("one row per item of an order", ["order_id", "order_item_id"],
                    [fk("order_id", "orders", "order_id"), fk("product_id", "products", "product_id"), fk("seller_id", "sellers", "seller_id")], {
        "order_item_id": "The item's number within its order: 1, 2, 3. Two of the same product are two rows.",
        "shipping_limit_date": "The date by which the seller had to hand the item to the carrier.",
        "price": "The item's price, in Brazilian reais.",
        "freight_value": "The item's share of the order's freight, in Brazilian reais.",
    }),
    "order_payments": ("one row per payment of an order", ["order_id", "payment_sequential"], [fk("order_id", "orders", "order_id")], {
        "payment_sequential": "The payment's number within its order: an order paid with a voucher and a card has two rows.",
        "payment_type": "How it was paid, such as credit_card, boleto or voucher.",
        "payment_installments": "The number of instalments the customer chose.",
        "payment_value": "The amount of this payment, in Brazilian reais.",
    }),
    # The source repeats some review IDs, so the reviews have no key.
    "order_reviews": ("one row per review of an order", [], [fk("order_id", "orders", "order_id")], {
        "review_id": "The review's ID. The source repeats some review IDs, so it is no key.",
        "review_score": "The customer's score, from 1 to 5.",
        "review_comment_title": "The review's title, in Portuguese; missing on most reviews.",
        "review_comment_message": "The review's text, in Portuguese; missing on many reviews.",
        "review_creation_date": "The day the review survey was sent to the customer.",
        "review_answer_timestamp": "When the customer answered the survey.",
    }),
    "products": ("one row per product", ["product_id"],
                 [fk("product_category_name", "product_category_name_translation", "product_category_name")], {
        "product_category_name": "The product's category, in Portuguese; missing on some products. Join it to "
                                 "product_category_name_translation for the English name.",
        "product_name_lenght": f"The number of characters in the product's name. {LENGHT}",
        "product_description_lenght": f"The number of characters in the product's description. {LENGHT}",
        "product_photos_qty": "The number of photos on the product's page.",
        "product_weight_g": "The product's weight, in grams.",
        "product_length_cm": "The product's length, in centimetres.",
        "product_height_cm": "The product's height, in centimetres.",
        "product_width_cm": "The product's width, in centimetres.",
    }),
    "sellers": ("one row per seller", ["seller_id"], [], {
        "seller_zip_code_prefix": "The first digits of the seller's postcode, as text.",
        "seller_state": "The seller's state, as a two-letter code.",
    }),
    "product_category_name_translation": ("one row per product category", ["product_category_name"], [], {
        "product_category_name": "The category's name in Portuguese, as products has it.",
        "product_category_name_english": "The category's name in English.",
    }),
}


def prepare(schema: str, source, out: pathlib.Path) -> dict:
    """Reads the eight CSV files of the zip at source.path (source.members) into out/<table>.parquet, with their checks."""
    result, kept = csvzip.prepare_tables(DATASET, source, out, TABLES, NOTES, keep={"customers": ["customer_unique_id"]})
    tables, checks, warnings = result["tables"], result["checks"], result["warnings"]
    checks["customers"] = {"customer_ids": len(kept[("customers", "customer_id")]),
                           "customer_unique_ids": len(kept[("customers", "customer_unique_id")])}
    orders = tables["orders"]
    ok = ORDERS_BAND[0] <= orders <= ORDERS_BAND[1]
    checks["published"] = {"orders": {"expected": f"about {ORDERS_PUBLISHED:,}", "band": list(ORDERS_BAND), "read": orders, "ok": ok}}
    if not ok:
        warnings.append(f"{DATASET}: {orders:,} orders read; 03 gives about {ORDERS_PUBLISHED:,} (the Kaggle page's 100k orders)")
    duplicates, not_found = csvzip.check_totals(checks)
    c = checks["customers"]
    result["summary"] = (f"{csvzip.rows_line(tables)}; customer_unique_id {c['customer_unique_ids']:,} for {c['customer_ids']:,} "
                         f"customer_id; key duplicates {duplicates:,}; link values not found {not_found:,}")
    return result

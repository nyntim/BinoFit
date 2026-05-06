#!/usr/bin/env python3
"""
Upload foods_clean.csv to Supabase foods table.

Usage:
    export SUPABASE_URL=https://xxx.supabase.co
    export SUPABASE_KEY=your_service_key
    python scripts/upload_foods_csv.py
"""

import os
import json
import time
import math
import requests
import pandas as pd

CSV_PATH = os.getenv("CSV_PATH", "/Users/timnguyen/foods_clean/foods_clean.csv")
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
BATCH_SIZE = 500

UPLOAD_COLS = [
    "id", "name", "brand", "serving_units", "calories", "protein",
    "carbs", "fat", "source", "fiber", "sugar", "sodium", "cholesterol",
    "saturated_fat", "trans_fat", "vitamin_d", "calcium", "iron", "potassium",
]

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

url = f"{SUPABASE_URL}/rest/v1/foods"

print(f"Reading {CSV_PATH}...")
df = pd.read_csv(CSV_PATH, dtype={"id": str}, low_memory=False)
df = df[[c for c in UPLOAD_COLS if c in df.columns]]
df["id"] = df["id"].astype(str)

total = len(df)
print(f"Uploading {total:,} foods in batches of {BATCH_SIZE}...")

uploaded = 0
errors = 0

for i in range(0, total, BATCH_SIZE):
    batch = df.iloc[i : i + BATCH_SIZE]
    body = batch.to_json(orient="records")  # pandas serializes NaN → null correctly
    n = len(batch)

    resp = requests.post(url, headers=HEADERS, data=body, timeout=30)

    if resp.status_code in (200, 201):
        uploaded += n
    else:
        errors += 1
        if errors <= 5:
            print(f"  [ERROR] batch {i // BATCH_SIZE}: {resp.status_code} {resp.text[:200]}")

    batch_num = i // BATCH_SIZE
    if batch_num % 20 == 0:
        pct = (i + n) / total * 100
        print(f"  {pct:.1f}%  ({uploaded:,} uploaded, {errors} errors)")

    time.sleep(0.05)

print(f"\nDone. {uploaded:,} / {total:,} uploaded. {errors} batch errors.")

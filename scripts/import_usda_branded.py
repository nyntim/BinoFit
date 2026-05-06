#!/usr/bin/env python3
"""
Import USDA FoodData Central branded foods into Supabase foods table.

Usage:
    pip install pandas requests
    python scripts/import_usda_branded.py

Set SUPABASE_URL and SUPABASE_KEY env vars or edit the constants below.
"""

import os
import csv
import json
import time
import requests
import pandas as pd
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
DATA_DIR = Path("/Users/timnguyen/Downloads/FoodData_Central_branded_food_csv_2026-04-30")
SUPABASE_URL = os.environ["SUPABASE_URL"]  # set via: export SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY = os.environ["SUPABASE_KEY"]  # set via: export SUPABASE_KEY=your_key
BATCH_SIZE = 500

# Nutrient IDs we care about (from nutrient.csv)
NUTRIENT_CALORIES      = {1008, 2047, 2048}  # KCAL (prefer 1008)
NUTRIENT_PROTEIN       = {1003}              # Protein (g)
NUTRIENT_CARBS         = {1005, 2039}        # Carbohydrates (g)
NUTRIENT_FAT           = {1004, 1085}        # Total fat (g)
NUTRIENT_FIBER         = {1079}              # Fiber, total dietary (g)
NUTRIENT_SUGAR         = {2000, 1063}        # Total Sugars (g)
NUTRIENT_SODIUM        = {1093}              # Sodium (mg)
NUTRIENT_CHOLESTEROL   = {1253}              # Cholesterol (mg)
NUTRIENT_SATURATED_FAT = {1258}              # Fatty acids, total saturated (g)
NUTRIENT_TRANS_FAT     = {1257}              # Fatty acids, total trans (g)
NUTRIENT_VITAMIN_D     = {1114}              # Vitamin D (D2+D3) (μg)
NUTRIENT_CALCIUM       = {1087}              # Calcium (mg)
NUTRIENT_IRON          = {1089}              # Iron (mg)
NUTRIENT_POTASSIUM     = {1092}              # Potassium (mg)
ALL_NUTRIENTS = (
    NUTRIENT_CALORIES | NUTRIENT_PROTEIN | NUTRIENT_CARBS | NUTRIENT_FAT |
    NUTRIENT_FIBER | NUTRIENT_SUGAR | NUTRIENT_SODIUM | NUTRIENT_CHOLESTEROL |
    NUTRIENT_SATURATED_FAT | NUTRIENT_TRANS_FAT | NUTRIENT_VITAMIN_D |
    NUTRIENT_CALCIUM | NUTRIENT_IRON | NUTRIENT_POTASSIUM
)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

# ── Step 1: Load food.csv ─────────────────────────────────────────────────────
print("Loading food.csv...")
food_df = pd.read_csv(
    DATA_DIR / "food.csv",
    usecols=["fdc_id", "description", "market_country"],
    dtype=str,
)
food_df = food_df[food_df["market_country"].str.strip() == "United States"]
food_df = food_df[["fdc_id", "description"]].drop_duplicates("fdc_id")
print(f"  US foods: {len(food_df):,}")

# ── Step 2: Load branded_food.csv ─────────────────────────────────────────────
print("Loading branded_food.csv...")
branded_df = pd.read_csv(
    DATA_DIR / "branded_food.csv",
    usecols=[
        "fdc_id", "brand_owner", "brand_name",
        "household_serving_fulltext", "serving_size", "serving_size_unit",
        "discontinued_date",
    ],
    dtype=str,
)
# Drop discontinued foods
branded_df = branded_df[branded_df["discontinued_date"].isna() | (branded_df["discontinued_date"].str.strip() == "")]
branded_df = branded_df[["fdc_id", "brand_owner", "brand_name", "household_serving_fulltext", "serving_size", "serving_size_unit"]]
branded_df = branded_df.drop_duplicates("fdc_id")
print(f"  Active branded foods: {len(branded_df):,}")

# ── Step 3: Join food + branded ───────────────────────────────────────────────
merged = food_df.merge(branded_df, on="fdc_id", how="inner")
valid_fdc_ids = set(merged["fdc_id"].astype(str))
print(f"  US + active + branded: {len(merged):,}")

# ── Step 4: Read food_nutrient.csv in chunks ──────────────────────────────────
print("Loading food_nutrient.csv (chunked)...")
nutrient_rows = []
chunk_size = 500_000
total_chunks = 0

for chunk in pd.read_csv(
    DATA_DIR / "food_nutrient.csv",
    usecols=["fdc_id", "nutrient_id", "amount"],
    dtype={"fdc_id": str, "nutrient_id": "Int64", "amount": "float64"},
    chunksize=chunk_size,
):
    chunk = chunk[chunk["fdc_id"].isin(valid_fdc_ids)]
    chunk = chunk[chunk["nutrient_id"].isin(ALL_NUTRIENTS)]
    chunk = chunk.dropna(subset=["amount"])
    nutrient_rows.append(chunk)
    total_chunks += 1
    if total_chunks % 10 == 0:
        print(f"  ...chunk {total_chunks}")

nutrients = pd.concat(nutrient_rows, ignore_index=True)
print(f"  Relevant nutrient rows: {len(nutrients):,}")

# ── Step 5: Pivot nutrients → calories, protein, carbs, fat ──────────────────
def pick_first(nutrient_set, group):
    """Pick amount from first matching nutrient_id in priority order."""
    for nid in sorted(nutrient_set):  # lower id = preferred
        match = group[group["nutrient_id"] == nid]["amount"]
        if not match.empty:
            return round(float(match.iloc[0]), 2)
    return None

print("Pivoting nutrients...")
macro_records = []
for fdc_id, group in nutrients.groupby("fdc_id"):
    # For calories prefer 1008, then 2047, then 2048
    cal = None
    for nid in [1008, 2047, 2048]:
        m = group[group["nutrient_id"] == nid]["amount"]
        if not m.empty:
            cal = round(float(m.iloc[0]), 2)
            break
    if cal is None:
        continue  # skip foods with no calorie data

    prot = None
    for nid in [1003]:
        m = group[group["nutrient_id"] == nid]["amount"]
        if not m.empty:
            prot = round(float(m.iloc[0]), 2)
            break

    carb = None
    for nid in [1005, 2039]:
        m = group[group["nutrient_id"] == nid]["amount"]
        if not m.empty:
            carb = round(float(m.iloc[0]), 2)
            break

    fat = None
    for nid in [1004, 1085]:
        m = group[group["nutrient_id"] == nid]["amount"]
        if not m.empty:
            fat = round(float(m.iloc[0]), 2)
            break

    def pick(nids):
        for nid in nids:
            m = group[group["nutrient_id"] == nid]["amount"]
            if not m.empty:
                return round(float(m.iloc[0]), 2)
        return None

    macro_records.append({
        "fdc_id": str(fdc_id),
        "calories":      cal,
        "protein":       prot,
        "carbs":         carb,
        "fat":           fat,
        "fiber":         pick(NUTRIENT_FIBER),
        "sugar":         pick(NUTRIENT_SUGAR),
        "sodium":        pick(NUTRIENT_SODIUM),
        "cholesterol":   pick(NUTRIENT_CHOLESTEROL),
        "saturated_fat": pick(NUTRIENT_SATURATED_FAT),
        "trans_fat":     pick(NUTRIENT_TRANS_FAT),
        "vitamin_d":     pick(NUTRIENT_VITAMIN_D),
        "calcium":       pick(NUTRIENT_CALCIUM),
        "iron":          pick(NUTRIENT_IRON),
        "potassium":     pick(NUTRIENT_POTASSIUM),
    })

macros_df = pd.DataFrame(macro_records)
print(f"  Foods with calorie data: {len(macros_df):,}")

# ── Step 6: Final join ────────────────────────────────────────────────────────
final = merged.merge(macros_df, on="fdc_id", how="inner")
print(f"  Final foods to import: {len(final):,}")

# Build serving_units: prefer household text, fallback to "X unit"
def build_serving(row):
    hs = str(row.get("household_serving_fulltext", "") or "").strip()
    if hs:
        return hs
    size = str(row.get("serving_size", "") or "").strip()
    unit = str(row.get("serving_size_unit", "") or "").strip()
    if size and unit:
        return f"{size} {unit}"
    return None

final["serving_units"] = final.apply(build_serving, axis=1)

# Pick best brand label
def build_brand(row):
    name = str(row.get("brand_name", "") or "").strip()
    owner = str(row.get("brand_owner", "") or "").strip()
    return name if name else (owner if owner else None)

final["brand"] = final.apply(build_brand, axis=1)

# ── Step 7: Upload to Supabase ────────────────────────────────────────────────
print("\nUploading to Supabase...")
url = f"{SUPABASE_URL}/rest/v1/foods"

rows = final[[
    "fdc_id", "description", "brand", "serving_units",
    "calories", "protein", "carbs", "fat",
    "fiber", "sugar", "sodium", "cholesterol",
    "saturated_fat", "trans_fat", "vitamin_d", "calcium", "iron", "potassium",
]].copy()
rows = rows.rename(columns={"fdc_id": "id", "description": "name"})

records = rows.to_dict(orient="records")
total = len(records)
uploaded = 0
errors = 0

for i in range(0, total, BATCH_SIZE):
    batch = records[i : i + BATCH_SIZE]

    # Clean NaN → None
    cleaned = []
    for r in batch:
        cleaned.append({k: (None if (v != v or v == "nan") else v) for k, v in r.items()})

    # Add source field
    for r in cleaned:
        r["source"] = "branded"

    resp = requests.post(url, headers=HEADERS, data=json.dumps(cleaned), timeout=30)

    if resp.status_code in (200, 201):
        uploaded += len(batch)
    else:
        errors += 1
        if errors <= 5:
            print(f"  [ERROR] batch {i//BATCH_SIZE}: {resp.status_code} {resp.text[:200]}")

    if (i // BATCH_SIZE) % 20 == 0:
        pct = (i + len(batch)) / total * 100
        print(f"  {pct:.1f}%  ({uploaded:,} uploaded, {errors} errors)")

    # Small delay to avoid rate limiting
    time.sleep(0.05)

print(f"\nDone. {uploaded:,} / {total:,} foods uploaded. {errors} batch errors.")

"""Build the Open Food Facts US subset for public.foods.

Usage: python -I build_off_subset.py <us_raw.parquet> <out.parquet>

us_raw.parquet is produced by stage.py from the OFF CSV export. Mapping mirrors
mapOffProduct / normalizeBarcode / buildServingUnits in lib/open-food-facts.ts,
except that servings over 2 kg fall back to per 100 g and serving labels are
cleaned (USDA unit codes, bracketed notes, stray symbols, lowercase).

Filters (agreed with the owner):
- US products, any creator (USDA-sourced OFF entries included)
- name and calories present; protein, carbs and fat all present
- per 100 g: kcal <= 900, protein + carbs + fat <= 105 g,
  kcal within 25% of 4/4/9 Atwater estimate when that estimate is > 20
- no non-Latin-script names
- plain oils need >= 80 g fat and protein bars/powders >= 5 g protein per 100 g
  (catches per-serving values entered as per 100 g)
- popular (scanned at least once or tagged in OFF scan rankings)
  or complete (brand, serving size and a main category)
- one row per normalized barcode and per lower(name) + lower(brand),
  preferring the most scanned then most recently modified
"""
import math
import re
import sys

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

sys.stdout.reconfigure(encoding="utf-8")
src, out = sys.argv[1], sys.argv[2]

KJ_PER_KCAL = 4.184
MAX_SERVING = 2000

# ---------- normalizeBarcode ----------

def has_valid_check_digit(d: str) -> bool:
    body = d[:-1]
    s = sum(int(c) * (3 if (len(body) - i) % 2 == 1 else 1) for i, c in enumerate(body))
    return (10 - s % 10) % 10 == int(d[-1])

def expand_upc_e(code: str):
    ns = code[0]
    if ns not in "01":
        return None
    a, b, c, d, e, f = code[1:7]
    check = code[7]
    if f in "012":
        body = f"{a}{b}{f}0000{c}{d}{e}"
    elif f == "3":
        body = f"{a}{b}{c}00000{d}{e}"
    elif f == "4":
        body = f"{a}{b}{c}{d}00000{e}"
    else:
        body = f"{a}{b}{c}{d}{e}0000{f}"
    return f"{ns}{body}{check}"

def normalize_barcode(raw):
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) not in (8, 12, 13, 14):
        return None
    if has_valid_check_digit(digits):
        return "0" + digits if len(digits) == 12 else digits
    if len(digits) == 8:
        upc_a = expand_upc_e(digits)
        if upc_a and has_valid_check_digit(upc_a):
            return "0" + upc_a
    return None

# ---------- mapOffProduct helpers ----------

def to_num(v):
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    try:
        n = float(v.replace(",", ".", 1))
    except ValueError:
        return None
    return n if math.isfinite(n) and n >= 0 else None

def to_text(v):
    return v.strip() if isinstance(v, str) and v.strip() else None

def js_round(v):  # Math.round: half up
    return math.floor(v + 0.5)

def round1(v):
    return js_round(v * 10) / 10

MEASURE_RE = re.compile(r"\d+(?:[.,]\d+)?\s*(?:grams?|g|milliliters?|ml|cl|l|fl\.?\s*oz|oz)\b", re.I)

def fmt_num(v):  # JS number to string for round1 values
    return str(int(v)) if v == int(v) else repr(v)

# Label cleanup beyond mapOffProduct: USDA unit codes (ONZ = oz, OZA = fl oz),
# bracketed notes, stray symbols and mis-encoded characters, then lowercase.
LABEL_FIXES = [
    (re.compile(r"\[[^\]]*\]?"), " "),
    (re.compile(r"â‰ˆ|≈|~"), " about "),
    (re.compile(r"â€\S?|Â"), " "),
    (re.compile(r"\bONZA?\b", re.I), "oz"),
    (re.compile(r"\bOZA\b", re.I), "fl oz"),
    (re.compile(r"\bf\s+oz\b", re.I), "fl oz"),
    (re.compile(r"\bPKG\b\.?", re.I), "package"),
    (re.compile(r"\bEA\b", re.I), "each"),
    (re.compile(r"\bCONT\b\.?", re.I), "container"),
    (re.compile(r"[#|\"=]"), " "),
]

def clean_serving_size(s):
    for pattern, repl in LABEL_FIXES:
        s = pattern.sub(repl, s)
    return s.lower()

def build_serving_units(serving_size, quantity, unit):
    if quantity is None or quantity <= 0:
        return "100g"
    q = f"{fmt_num(round1(quantity))}{unit}"
    label = clean_serving_size(serving_size or "")
    label = re.sub(r"\([^)]*\)?", " ", label)
    label = MEASURE_RE.sub(" ", label)
    label = re.sub(r"\s+", " ", label)
    label = re.sub(r"^[\s,;:/.)-]+|[\s,;:/(-]+$", "", label)
    return f"{label} ({q})" if label else q

NUTRIENTS = [  # (column, OFF base, factor to our unit)
    ("fiber", "fiber", 1), ("sugar", "sugars", 1),
    ("saturated_fat", "saturated-fat", 1), ("trans_fat", "trans-fat", 1),
    ("cholesterol", "cholesterol", 1000), ("sodium", "sodium", 1000),
    ("potassium", "potassium", 1000), ("calcium", "calcium", 1000),
    ("iron", "iron", 1000), ("vitamin_d", "vitamin-d", 1e6),
    ("added_sugar", "added-sugars", 1), ("monounsat_fat", "monounsaturated-fat", 1),
    ("polyunsat_fat", "polyunsaturated-fat", 1), ("magnesium", "magnesium", 1000),
    ("zinc", "zinc", 1000), ("phosphorus", "phosphorus", 1000), ("copper", "copper", 1000),
    ("manganese", "manganese", 1000), ("selenium", "selenium", 1e6),
    ("vitamin_c", "vitamin-c", 1000), ("vitamin_k", "vitamin-k", 1e6),
    ("thiamin", "vitamin-b1", 1000), ("riboflavin", "vitamin-b2", 1000),
    ("niacin", "vitamin-pp", 1000), ("b6", "vitamin-b6", 1000), ("folate", "folates", 1e6),
    ("b12", "vitamin-b12", 1e6), ("choline", "choline", 1000),
]

def map_row(r):
    code = normalize_barcode(r["code"])
    name = to_text(r["product_name"]) or to_text(r["generic_name"])
    if not code or not name:
        return None
    brands = to_text(r["brands"])
    brand = (brands.split(",")[0].strip() or None) if brands else None

    serving_size = to_text(r["serving_size"])
    raw_qty = to_num(r["serving_quantity"])
    unit = "ml" if re.search(r"ml\b", serving_size or "", re.I) else "g"
    quantity = raw_qty if raw_qty is not None and 0 < raw_qty <= MAX_SERVING else None

    def per100(base):
        return to_num(r.get(f"{base}_100g"))

    def scaled(v):
        return None if v is None else (v * quantity / 100 if quantity is not None else v)

    kcal100 = per100("energy-kcal")
    if kcal100 is None:
        kj = per100("energy-kj")
        if kj is None:
            kj = per100("energy")
        kcal100 = None if kj is None else kj / KJ_PER_KCAL
    if kcal100 is None:
        return None

    pr, cb, ft = per100("proteins"), per100("carbohydrates"), per100("fat")
    row = {
        "id": f"off:{code}",
        "name": name,
        "brand": brand,
        "serving_units": build_serving_units(serving_size, quantity, unit),
        "calories": float(js_round(scaled(kcal100))),
        "protein": round1(scaled(pr) or 0),
        "carbs": round1(scaled(cb) or 0),
        "fat": round1(scaled(ft) or 0),
        "source": "open_food_facts",
    }
    for col, base, factor in NUTRIENTS:
        v = scaled(per100(base))
        row[col] = None if v is None else v * factor
    if row["sodium"] is None:
        salt = scaled(per100("salt"))
        row["sodium"] = None if salt is None else salt * 400
    # Filter-only fields
    row.update({
        "_kcal100": kcal100, "_pr100": pr, "_cb100": cb, "_ft100": ft,
        "_scans": int(to_num(r["unique_scans_n"]) or 0),
        "_popular_tag": "scans" in (r["popularity_tags"] or ""),
        "_has_serving": serving_size is not None,
        "_has_cat": (r["main_category"] or "en:undefined") != "en:undefined",
        "_cat": r["main_category"] if (r["main_category"] or "en:undefined") != "en:undefined" else None,
        "_modified": int(to_num(r["last_modified_t"]) or 0),
        "_usda": r["creator"] in ("usda-ndb-import", "org-database-usda", "org-usda-test"),
    })
    return row

# ---------- map ----------

cols = ["code", "product_name", "generic_name", "brands", "serving_size", "serving_quantity",
        "unique_scans_n", "popularity_tags", "main_category", "last_modified_t", "creator",
        "energy-kcal_100g", "energy-kj_100g", "energy_100g", "proteins_100g",
        "carbohydrates_100g", "fat_100g", "salt_100g"] + [f"{b}_100g" for _, b, _ in NUTRIENTS]
cols = list(dict.fromkeys(cols))
mapped = []
pf = pq.ParquetFile(src)
for batch in pf.iter_batches(columns=cols, batch_size=50_000):
    for r in batch.to_pylist():
        m = map_row(r)
        if m:
            mapped.append(m)
print("mapped:", len(mapped))

con = duckdb.connect()
con.register("m", pa.Table.from_pylist(mapped))
NON_LATIN = r"[\p{Han}\p{Hiragana}\p{Katakana}\p{Hangul}\p{Cyrillic}\p{Arabic}\p{Hebrew}\p{Thai}\p{Greek}\p{Devanagari}\p{Armenian}\p{Georgian}]"
# Per-serving values entered as per 100 g: a plain oil must be mostly fat, and a
# protein bar or powder can't be under 5 g protein per 100 g.
PURE_OIL = (r"regexp_matches(lower(trim(name)), '^((organic|pure|100%|extra|virgin|light|lighter|tasting|flavor|"
            r"refined|unrefined|roasted|toasted|high|oleic|cold|pressed|expeller|premium|classic|spanish|italian|"
            r"greek|california|blended|blend|of)[ ,-]*)*(olive|avocado|canola|vegetable|coconut|sesame|sunflower|"
            r"peanut|grapeseed|safflower|corn|soybean|walnut|mct) oil$')")
PROTEIN_SOLID = (r"(regexp_matches(lower(name), 'protein') and "
                 r"regexp_matches(lower(name), '(^|[^a-z])(bars?|powder|isolate)([^a-z]|$)'))")
con.execute(f"""
create table f as
with q as (
  select *, 4*_pr100 + 4*_cb100 + 9*_ft100 as _atw from m
  where _pr100 is not null and _cb100 is not null and _ft100 is not null
    and _kcal100 <= 900 and _pr100 + _cb100 + _ft100 <= 105
    and not regexp_matches(name, '{NON_LATIN}')
),
ok as (
  select * from q
  where not (_atw > 20 and abs(_kcal100 - _atw) / greatest(_kcal100, _atw) > 0.25)
    and not ({PURE_OIL} and _ft100 < 80)
    and not ({PROTEIN_SOLID} and _pr100 < 5)
    and (_scans >= 1 or _popular_tag or (brand is not null and _has_serving and _has_cat))
),
by_id as (
  select * from ok qualify row_number() over (partition by id order by _scans desc, _modified desc) = 1
)
select * from by_id
qualify row_number() over (partition by lower(name), lower(coalesce(brand, '')) order by _scans desc, _modified desc) = 1
""")
print(con.sql("select count(*) total, count(*) filter (where _usda) usda from f"))
keep = ("id, name, brand, serving_units, calories, protein, carbs, fat, source, "
        + ", ".join(c for c, _, _ in NUTRIENTS))
con.execute(f"""copy (select {keep}, _usda as from_usda, _scans as scans, _cat as category,
  _kcal100 as kcal100, _pr100 as pr100, _cb100 as cb100, _ft100 as ft100, _atw as atw100 from f order by id) to '{out}.audit.parquet' (format parquet, compression zstd)""")
con.execute(f"copy (select {keep} from f order by id) to '{out}' (format parquet, compression zstd)")
print("wrote", out)

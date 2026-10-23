"""Stage US products from the OFF CSV export into a raw parquet for profiling."""
import sys
import duckdb

src, out = sys.argv[1], sys.argv[2]
con = duckdb.connect()
con.execute("SET preserve_insertion_order=false")

NUM = [
    'energy-kcal_100g', 'energy-kj_100g', 'energy_100g',
    'proteins_100g', 'carbohydrates_100g', 'fat_100g', 'sugars_100g', 'fiber_100g',
    'saturated-fat_100g', 'trans-fat_100g', 'cholesterol_100g', 'sodium_100g', 'salt_100g',
    'potassium_100g', 'calcium_100g', 'iron_100g', 'vitamin-d_100g',
    'added-sugars_100g', 'monounsaturated-fat_100g', 'polyunsaturated-fat_100g',
    'magnesium_100g', 'zinc_100g', 'phosphorus_100g', 'copper_100g', 'manganese_100g',
    'selenium_100g', 'vitamin-c_100g', 'vitamin-k_100g', 'vitamin-b1_100g', 'vitamin-b2_100g',
    'vitamin-pp_100g', 'vitamin-b6_100g', 'folates_100g', 'vitamin-b12_100g', 'choline_100g',
]
TXT = [
    'code', 'product_name', 'generic_name', 'brands', 'creator', 'countries_tags',
    'serving_size', 'serving_quantity', 'categories_tags', 'main_category',
    'nutriscore_grade', 'nova_group', 'unique_scans_n', 'popularity_tags',
    'completeness', 'last_modified_t', 'created_t', 'data_quality_errors_tags',
    'states_tags', 'brand_owner', 'owner', 'quantity', 'product_quantity',
    'abbreviated_product_name',
]
cols = TXT + NUM
types = {c: 'VARCHAR' for c in cols}
sel = ', '.join(f'"{c}"' for c in cols)
con.execute(f"""
COPY (
  SELECT {sel}
  FROM read_csv('{src}', delim='\t', header=true, quote='', escape='',
                all_varchar=true, ignore_errors=true, strict_mode=false, max_line_size=20000000)
  WHERE countries_tags LIKE '%en:united-states%'
) TO '{out}' (FORMAT parquet, COMPRESSION zstd)
""")
print(con.execute(f"select count(*) from '{out}'").fetchone())

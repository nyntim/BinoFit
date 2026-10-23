# Open Food Facts subset

Builds the US Open Food Facts catalog stored in `public.foods`. The data is licensed ODbL (Open Food Facts). The filters live in the docstring of `build_off_subset.py`.

1. Download https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz
2. `pip install duckdb pyarrow`
3. Run `stage.py`, then `build_off_subset.py`, then `import_off_subset.py` (each script documents its arguments).

`import_off_subset.py` reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment or `.env.import.local` (gitignored).

Serving quantities use the same inclusive `0 < quantity <= 2000` g/ml cap as live barcode mapping. Larger or invalid quantities fall back to per-100g nutrition and `100g` units. Labels share ordered cleanup for USDA unit codes, notes, punctuation and lowercase text. Mass-ounce measures are removed; fluid-ounce measures retain `fl oz`, so `8 OZA` with a 240 ml quantity becomes `fl oz (240ml)`.

Shared expectations live in `test-utils/fixtures/off-serving-parity.json` and run in both Jest and Python in CI. Run the Python checks without DuckDB, PyArrow or catalog files:

```sh
python3 -I scripts/off-subset/test_serving_parity.py
```

Importing `build_off_subset.py` exposes pure mapping helpers without running the catalog pipeline. The existing isolated CLI command still runs the complete pipeline.

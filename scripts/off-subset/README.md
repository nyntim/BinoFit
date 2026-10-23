# Open Food Facts subset

Builds the US Open Food Facts catalog stored in `public.foods`. The data is licensed ODbL (Open Food Facts). The filters live in the docstring of `build_off_subset.py`.

1. Download https://static.openfoodfacts.org/data/en.openfoodfacts.org.products.csv.gz
2. `pip install duckdb pyarrow`
3. Run `stage.py`, then `build_off_subset.py`, then `import_off_subset.py` (each script documents its arguments).

`import_off_subset.py` reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment or `.env.import.local` (gitignored).

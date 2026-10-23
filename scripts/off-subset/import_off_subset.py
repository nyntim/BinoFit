"""Import the Open Food Facts US subset into Supabase.

Usage: python -I import_off_subset.py <off_us_subset.parquet> <off_us_subset.parquet.audit.parquet>

Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment or from
.env.import.local in the current directory (gitignored by `.env*.local`).

1. Uploads the parquet to Storage: datasets/open-food-facts/off_us_subset.parquet
2. Upserts every row into public.foods (on id), in batches
3. Upserts scan counts into public.food_popularity (on food_id)
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import pyarrow.parquet as pq

BATCH = 1000


def load_env():
    env = dict(os.environ)
    if os.path.exists(".env.import.local"):
        for line in open(".env.import.local", encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    url, key = env.get("SUPABASE_URL"), env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (env or .env.import.local)")
    return url.rstrip("/"), key


def request(method, url, key, body, content_type, extra=None):
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": content_type}
    headers.update(extra or {})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=body, method=method, headers=headers), timeout=120) as r:
                return r.status
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")[:500]
            if e.code < 500 or attempt == 4:
                sys.exit(f"{method} {url} failed: {e.code} {msg}")
        except urllib.error.URLError as e:
            if attempt == 4:
                sys.exit(f"{method} {url} failed: {e}")
        time.sleep(2 ** attempt)


def upsert(base, key, table, conflict, rows):
    for i in range(0, len(rows), BATCH):
        body = json.dumps(rows[i:i + BATCH]).encode()
        request("POST", f"{base}/rest/v1/{table}?on_conflict={conflict}", key, body, "application/json",
                {"Prefer": "resolution=merge-duplicates,return=minimal"})
        done = min(i + BATCH, len(rows))
        if done % 20000 < BATCH or done == len(rows):
            print(f"  {table}: {done:,}/{len(rows):,}", flush=True)


def main():
    subset, audit = sys.argv[1], sys.argv[2]
    base, key = load_env()

    print("Uploading parquet to storage...", flush=True)
    data = open(subset, "rb").read()
    request("POST", f"{base}/storage/v1/object/datasets/open-food-facts/off_us_subset.parquet", key, data,
            "application/octet-stream", {"x-upsert": "true"})
    print(f"  uploaded {len(data):,} bytes")

    now = datetime.now(timezone.utc).isoformat()
    rows = pq.read_table(subset).to_pylist()
    for r in rows:
        r["updated_at"] = now
        # Postgres real underflows on tiny values (one OFF row has 1.6e-53).
        for k, v in r.items():
            if isinstance(v, float) and abs(v) < 1e-9:
                r[k] = 0.0
    print(f"Upserting {len(rows):,} foods...", flush=True)
    upsert(base, key, "foods", "id", rows)

    pop = [{"food_id": r["id"], "scans": r["scans"]}
           for r in pq.read_table(audit, columns=["id", "scans"]).to_pylist() if r["scans"] > 0]
    print(f"Upserting {len(pop):,} popularity rows...", flush=True)
    upsert(base, key, "food_popularity", "food_id", pop)
    print("Done.")


if __name__ == "__main__":
    main()

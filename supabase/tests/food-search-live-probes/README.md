# Isolated live search probes

Run each SQL file as its own SQL Editor request after migration006. Each RPC file performs exactly one authenticated call with an eight-second statement timeout and a random synthetic anonymous user, then rolls back. If a request errors or times out, run `ROLLBACK` separately. No production identity or credentials are needed.

Capture EXPLAIN JSON Execution Time, actual function count and timeout per file: common, prefix, typo, multiword, nonsense. SQL Editor gateway wall time is separate from database Execution Time. Do not combine these files in one request.

Run candidates.sql separately for each of its five listed query settings. The strong materialized CTE actual row count is the FTS candidate count; its aggregate filter shows strong accepted rows. If at least requested20 are strong, the real RPC stops there. The fallback materialized scored CTE actual row count shows the combined per-token predicates before quality rejection. Its underlying BitmapAnd/BitmapOr plan should combine postings before heap access, and quality runs once per candidate. No arbitrary candidate cap exists. Inspect actual index names and buffers; do not disable sequential scans. An RPC Function Scan alone cannot reveal internal candidate phases.

The old food-search-live.sql bundles calls and is unsuitable for latency diagnosis. Keep its security fixture assertions for local/disposable regression; use the isolated probes for live latency. `food-search-relevance.sql` verifies access, legacy arguments, ordered fast-path20, requested50 fuzzy fill and repeated-letter/multiple-token typos with rolled-back fixtures.

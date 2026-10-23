# Food search relevance

Decision record, 23 October 2026, issue 107.

## Research and choices

These are BinoFit choices, informed by primary documentation. Competitor help pages describe workflows, not proprietary ranking weights or exact empty-state wording.

- [Algolia's ordered relevance criteria](https://www.algolia.com/blog/engineering/how-algolia-tackled-the-relevance-problem-of-search-engines) and [last-word prefix behavior](https://www.algolia.com/blog/product/unveiling-the-search-algorithm-how-algolia-improved-search) support keeping exactness, typo count and proximity as distinct ordering criteria. BinoFit uses explicit match buckets rather than a single similarity cutoff.
- [Meilisearch's typo policy](https://www.meilisearch.com/blog/typo-tolerance) and [settings specification](https://specs.meilisearch.dev/specifications/text/0117-typo-tolerance-setting-api.html) allow one typo at five letters and two at nine by default. BinoFit chooses one insertion/deletion/substitution only at six or more letters; short food words need greater precision.
- [Typesense's configurable token dropping](https://typesense.org/docs/28.0/api/search.html) illustrates a recall policy. BinoFit never drops a significant word, even with three or more words.
- Elasticsearch separates [required clause coverage](https://www.elastic.co/docs/reference/query-languages/query-dsl/query-dsl-minimum-should-match) from [corpus-dependent similarity scoring](https://www.elastic.co/docs/reference/elasticsearch/index-settings/similarity). Coverage is the gate; bounded personal history or popularity cannot rescue a missing word. An absolute BM25 threshold would not translate across mobile and server catalogs.
- PostgreSQL documents [text search parsing, prefixes and cover-density ranking](https://www.postgresql.org/docs/current/textsearch-controls.html) and [indexed strict-word trigram operators](https://www.postgresql.org/docs/current/pgtrgm.html). Ordinary tokens go through `websearch_to_tsquery('simple', ...)`; only validated letters/numbers form the final-token prefix tsquery. The indexed column uses `%>>`. A final per-token edit gate follows retrieval. The proposed 0.45 candidate threshold failed `xaaaaa` versus `aaaaaa` (similarity 0.2857143); the fixed candidate threshold is 0.25. This broadens candidates, while the one-edit gate still controls acceptance.
- [SQLite FTS5](https://www.sqlite.org/fts5.html) supplies prefix indexes and BM25, with lower BM25 scores indicating better matches. It does not supply edit-distance typo tolerance. Pre-tokenizing the 8,052-row immutable USDA name metadata avoids asset rebuilds, database migrations and FTS availability assumptions. Only accepted food IDs are hydrated with nutrients.
- [MacroFactor's logging groups](https://help.macrofactorapp.com/en/articles/215-how-to-log-food-in-macrofactor), [Cronometer's common/custom/favorite food workflows](https://support.cronometer.com/hc/en-us/articles/360018193011-Add-a-Food), and MyFitnessPal's [personal lists](https://support.myfitnesspal.com/hc/en-us/articles/360032622071-How-the-Recent-and-Frequent-lists-work) and [custom food support](https://support.myfitnesspal.com/hc/en-us/articles/15457546881805-What-is-included-in-the-free-version) motivate a bounded personal preference and direct custom/scan actions.

## Matching contract

Both engines normalize Unicode NFD, remove combining marks U+0300 through U+036F, lowercase and split punctuation into literal word separators. They keep numeric and short words such as `7up`, deduplicate repeated tokens and remove the existing filler list. Empty, filler-only, over-200-character and over-12-token queries return nothing. Amount/unit extraction remains a separate client parsing step.

Every significant token must match. Exact tokens and conservative trailing-s plural equivalence beat a final-token prefix, which beats a one-edit long-token typo. Earlier tokens have no prefix privilege. Local order then considers exact normalized name, worst and total token quality, ordered proximity, name versus brand, capped history, source preference, name length and stable ID. SQL uses the same quality buckets, with bounded FTS rank and popularity inside them. Local result limits apply after coverage over the entire metadata catalog.

| Fixed query | Required behavior |
| --- | --- |
| `pea` | Peas/Green peas above Peach/Peanut; no Chickpea/Apple |
| `green pea` | Requires green, accepts peas |
| `chiken breast` | Chicken breast, no Chicken soup |
| `dragonfruit smoothie` | No Dragonfruit-only fallback |
| `dragonfruit kombucha jelly`, `qwzxv` | No results |
| `greek yog` / `gre yog` | Final prefix accepted / earlier prefix rejected |
| `100g chicken breast` | Preserve amount/unit and both food tokens |
| `ben & jerry's`, `Crème, (7up). 2%_plain` | Literal separators, brand coverage, accents and numbers |
| `xaaaaa` | One-edit `aaaaaa` survives indexed candidate retrieval |

## Measured request counts

`lib/__tests__/food-search-session.test.ts` runs both policies on identical fake-timer traces and fixture local responses. The old baseline exists only in test code: a 300ms debounce starts a remote request for sparse local results. The new controller uses local 150ms, remote 700ms, fewer than eight strong local matches and normalized query length at least three. Sort changes only reorder loaded sets. Submit/manual lookup is immediate. Tests observe actual remote mock starts, not estimated production savings.

| Trace | Old RPC starts | New RPC starts |
| --- | ---: | ---: |
| `qwz` 400ms, `qwzx` 400ms, `qwzxv` 800ms, `qwzx` 400ms, `qwzxv` 800ms | 5 | 1 |
| `qwz`, `qwzx`, `qwzxv`, `qwzx`, `qwz`, each 800ms | 5 | 1 |
| Eight strong local `milk` rows, then manual submit | 0 automatic | 0 automatic, 1 manual |
| Branded query with immediate keyboard submit, then sort | 1 | 1, sort adds 0 |

The 100-key screen/account LRU caches successful raw server results before local ID dedupe, including true negatives. Errors, eight-second timeouts and aborts do not become negatives. Exact repeats always reuse negatives. Inference only extends an unchanged final prefix from length three through five, with no typo-eligible tokens. It stops at token boundaries and six-character transitions (`chike` must not suppress `chiken`). Manual lookup bypasses inferred negatives. Positive cache reads do not write food storage; issue 114's runtime `detailsPending` marker requires full hydration before selection, so search summaries are never persisted as complete profiles.

## Latency and memory

Desktop diagnostic, Node v24.15.0, bundled SQLite asset, 8,052 actual rows: 30 repetitions of the eight fixed matching queries, 240 pre-tokenized ranking scans, p50 **1.11ms**, p95 **1.71ms**. The process heap delta while reading and pre-tokenizing metadata was approximately **8.37MB**; this is an allocation estimate, not retained-memory profiling. Initial unindexed name normalization on every scan measured p50 49.11ms/p95 186.90ms, which prompted pre-tokenization. The measured scan excludes database hydration and first-read setup. No native speedup is claimed. iOS/Android latency, frame responsiveness and retained memory still require device profiling, especially on older devices.

## SQL verification and release

`202610230004_food_search_relevance.sql` adds an expression GIN FTS index and immutable invoker helpers, retains the combined trigram index and replaces the original three-argument RPC without overloading. It does not rewrite catalog rows or alter user schemas, sync or tombstones. Built-in PostgreSQL Unicode normalization requires UTF-8 PostgreSQL 13+. `search_path = ''`, live-account checks, explicit public-or-own restrictions in every candidate branch and authenticated-only execution remain enforced. Legacy `exclude_ids` and the output column shape remain compatible. New clients send only `q`/`max_results` and dedupe IDs locally.

Migration and transaction-rolled-back `supabase/tests/food-search-relevance.sql` pass on disposable PGlite v0.5.10 with real `pg_trgm`; the regression includes anonymous and normal accounts, both directions of owner isolation, missing/deleted identities, grants, relevance, limits and legacy exclusions. This is a SQL behavior check, not a production query-plan measurement.

The release lead must apply SQL before the client and record deployed PostgreSQL/extension versions, index build duration, authenticated HTTP reads with and without legacy exclusions, and `EXPLAIN (ANALYZE, BUFFERS)` on common, nonsense and typo queries under a statement timeout. Confirm index use and latency on the live catalog. A regular index build can block writes briefly; if duration warrants it, build the same index concurrently outside the migration transaction first. The saved rollback file is `supabase/rollback/202610230004_food_search_relevance.sql`. It restores only the old `search_foods` definition and grants from `202610230002_live_account_reads.sql`; additive helpers/index may remain. Never reimport or delete the catalog.

Native manual checks remain: recent/frequent blank state; exact, plural, prefix and typo queries; amount parsing; empty-state create/scan meal/date context and selection-discard guards; scanner cancellation; submit; edit/clear/unmount races; offline retry; sorting and multi-select; serving return; custom edit refresh; dark mode and large text.


## Live performance correction, migration 005

The isolated authenticated deployed004 `chicken breast` probe exceeded an eight-second database statement timeout (8,064ms observed by the release lead). A bundled multi-RPC gateway timeout did not identify the slow statement, so probes now run one request per query in `supabase/tests/food-search-live-probes/`. Local PGlite correctness results are not evidence of live latency.

Migration `202610230005_food_search_candidate_intersection.sql` replaces only the RPC and grants; deployed004 stays unchanged. It first evaluates the combined exact/plural/final-prefix FTS candidates with materialized quality. When accepted strong rows fill the caller's clamped requested limit, no typo row can outrank them, so it returns immediately. The cutoff follows max_results (including50), not a fixed20. Otherwise it INTERSECTs one indexed candidate superset per token. Each token retains FTS exact/plural, the final token retains prefix, and each long token also retains its raw-name/brand indexed trigram UNION. Multiple long-word typos therefore remain discoverable. Quality is materialized once after candidate dedupe/access/exclusions. There is no first-N candidate limit: the theoretical fallback bound is at most the smallest token candidate-set cardinality, versus the old union-any population, before the authoritative coverage gate.

[PostgreSQL CTE materialization](https://www.postgresql.org/docs/current/queries-with.html) prevents repeated expensive scoring, [INTERSECT semantics](https://www.postgresql.org/docs/current/queries-union.html) justify intersecting safe per-token supersets, and [pg_trgm indexed operators](https://www.postgresql.org/docs/current/pgtrgm.html) retain indexed typo retrieval. These choices are a response to the SQL shape and observed timeout; live EXPLAIN candidate counts and five separate RPC timings remain release gates. Existing normalized FTS versus raw trigram index accent behavior is unchanged. Accented exact/prefix fixtures pass; accented fuzzy recall beyond the existing raw trigram filter is not claimed.

For cold connections005 loads pg_trgm inside the RPC before transaction-local `set_config(..., true)`. Its function configuration contains only empty search_path, removing004's threshold setting that could be validated before the extension registered the GUC. The setting cannot survive the request transaction. Output/signature, authenticated grants, legacy exclusions, live-account checks, own/public visibility and ordering are preserved.


Release-lead preliminary live branch evidence before005: the common strong FTS branch used `idx_foods_search_fts` with 848 index candidates, 438 heap blocks and 388.086ms total execution (15.352ms index scan, 387.765ms heap scan), with 88.242ms planning. This supports the strong-path optimization but does not measure the full replacement RPC. Migration005 deployed successfully; final five-query timings/body-hash confirmation are recorded by the lead. Rollback to 004's RPC is available at `supabase/rollback/202610230005_food_search_candidate_intersection.sql`;004's known common-query timeout makes rollback an emergency compatibility option, not a performance remedy.


Isolated authenticated RPC evidence after 005: `chicken breast` returned 20 rows with no error in 937.875ms; `chiken breast` still exceeded the eight-second statement timeout (8,363.79ms observed). Common-search latency improved, but fuzzy-search performance remains an unresolved release gate. No complete live performance claim is made. Further optimization requires preserving all per-token strong/fuzzy modes and the final coverage gate.


## Bitmap candidate correction, migration006

The 005 fallback still fetched/rechecked token populations separately. Release-lead measurements of one `chiken` trigram branch found 57,228 bitmap candidates, 40,275 heap rejections, 5,188 heap blocks and 2,537ms. The approved 006 replacement uses one indexed boolean expression: AND across tokens, with FTS OR optional long-token trigram inside each token. The candidate universe and final gate are unchanged; the planner can combine postings with BitmapAnd/BitmapOr before heap fetch. A live prototype measured 1,212 accepted heap candidates, 6,851 rechecks, 3,112 heap blocks and 755.183ms. This is candidate-predicate evidence, not yet full-RPC latency.

`202610230006_food_search_bitmap_candidates.sql` retains 005's strong fast path, requested-limit behavior, materialized quality, bound parameters, cold-backend initialization and security/compatibility guarantees.004 and 005 remain immutable deployment history. Schema reflects006; rollback to005 is at `supabase/rollback/202610230006_food_search_bitmap_candidates.sql`. No lexicon table, data rewrite, arbitrary candidate cap or threshold change is introduced. The isolated candidates probe now matches006's physical query shape. Final per-query RPC timings and actual plans remain the release gate.

After006 deployment, the isolated full authenticated `chiken breast` RPC returned 20 rows without error in **5,822.277ms**, below the eight-second client timeout. This includes quality/ranking work and is substantially slower than the 755.183ms candidate-only prototype; fuzzy latency remains a performance limitation even though the earlier timeout is resolved for this query. Common search remained about 938ms. Nonsense/multiword timings and deployed body-hash verification are recorded separately by the release lead.

Live final verification: migration 006 returned zero rows for `dragonfruit kombucha jelly` in 618.953ms, with no RPC error. All timing probes used random rollback-only identities.
Live final nonsense query `qwzxv` returned zero rows in 55.685ms with no error.

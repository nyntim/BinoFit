# Data, tombstones and sync

## Storage layers

- SQLite (`lib/database.ts`, wrapping `expo-sqlite`): foods, food logs, meals, weight entries (`lib/weight.ts`) and training tables (`lib/workouts/schema.ts`, called from `initSchema` in `lib/database-connection.ts`).
- AsyncStorage (`lib/storage.ts`): goals, profile, device preferences, quick-add drinks, sync timestamps. See [preferences.md](preferences.md).
- Supabase (`lib/supabase.ts`): cloud sync and backup. Every install has a session (see [auth.md](auth.md)). Session tokens live in the Keychain via `lib/secure-session-storage.ts`.

## `lib/database.ts`

`lib/database.ts` only re-exports. Callers import from `@/lib/database` (never a `database-*` file) so `jest.mock('@/lib/database')` covers them; the `database-*` files import each other directly to avoid cycles. Its re-exports are read-only, so `jest.spyOn` a function on its defining file instead.

- `lib/database-connection.ts`: `getDatabase()`, `initSchema` (tables and migrations), default meal seeding.
- `lib/database-foods.ts`: food search, the remote food cache, barcode and id lookups, custom foods.
- `lib/database-food-logs.ts`: food log writes, reads by date or range, logged dates, recent and frequent foods, `isRemoteNewer`, `applyRemoteFoodLogs`.
- `lib/database-meals.ts`: meal definitions and names, `saveMealDraft`, `replaceMealsFromRemote`, meal slot confirmations.
- `lib/database-water.ts`: water logs.
- `lib/database-maintenance.ts`: `getMissingFoodIds`, `clearUserData`, `markAllUnsynced`.

- `getFoodLogsWithFoodByDate()`: daily logs joined with food data (also hydrates nutrients, see [nutrition.md](nutrition.md)).
- `addCustomFood()`, `cacheRemoteFood()` (caches remote search results, also stores `barcode`), `getFoodByBarcode()` (local lookup by normalized barcode, custom food first, then most recent; `foods.barcode` is device-only, not synced).
- `deleteFoodLog()`: tombstones a food log.
- `getLoggedDates()`: history date range.
- Meals: `getMealDefinitions()`, `getMealNames()`, `countFoodLogsForMeal()` (meals seeded once with the four defaults); `saveMealDraft()` applies the dashboard edit-mode draft (adds, renames, order, targets, deletes) in one transaction and tombstones a deleted meal's logs.
- Sync tracking: `getUnsyncedMealDefinitions()` / `markMealDefinitionsSynced()`, `getUnsyncedMealNames()` / `markMealNamesSynced()`.

## Tombstones

Deleting a synced row never calls Supabase directly. `lib/tombstones.ts`:

- `tombstoneSql(table)` sets `deleted_at`, `updated_at` and `synced_at = NULL`. Tables must be allow-listed there.
- Sync pushes `deleted_at`, then `purgeSyncedTombstones(table)` removes synced tombstones (nothing is purged if the push errors).
- Every read of `food_logs` must filter `deleted_at IS NULL` (a missed filter resurrects deleted food). `getUnsyncedFoodLogs` is the only read that returns tombstones. Writes to a log guard `deleted_at IS NULL`.
- `markRowsSynced(table, [{id, updated_at}])` marks only rows unchanged since the push, so an edit made during a push stays unsynced. `meal_definitions` / `meal_names` still use the older id-only mark functions.
- Restore passes tombstones to `applyRemoteFoodLogs`, which uses `decideRemoteApply`: a newer remote tombstone deletes local, a tombstone with no local row is skipped, otherwise last-write-wins, and ties keep local.
- New synced tables (weight, training, routines) follow the same rules.

## Supabase sync

`lib/sync.ts` `syncToSupabase()` pushes unsynced local data. It is fire-and-forget and never throws; call it after every write and on app foreground, never awaited inline. Sync skips silently while there is no session. Tables: `food_logs`, `weight_entries`, `user_goals`, `user_profile`, `foods`, `meal_definitions`, `meal_names`, `exercises` (custom only), `workouts` (status `done` only), `workout_exercises`, `workout_sets`, `routines`, `routine_exercises`.

`supabase/schema.sql` is the Supabase schema. RLS is deployed in two steps (STEP A then STEP B); both are applied to production, so every user-data table is own-rows-only for `authenticated`. Bounded SQL blocks for new columns (for example `workout_sets_rir`, `workouts_playlist_columns`, `micronutrient_food_columns`) must be applied before releasing clients that use them.

## Sync status

`lib/sync-status.ts` is a pub/sub store (`status`, `lastSuccessAt`, `failingSince`, `isOffline`) fed by `syncToSupabase()`, which throws per step on Supabase `{ error }`, runs every step (`allSettled`), and coalesces calls made mid-sync into one extra pass. `deriveIndicator` hides failures for a 30 s grace period.

- UI: `useSyncStatus`, `components/SyncIndicator.tsx` (dashboard pill, tap retries), Settings "Last synced" row (`getLastSyncAt` / `setLastSyncAt` in `lib/storage.ts`).
- `useSyncAutoRetry` (mounted in `app/_layout.tsx`) tracks NetInfo, syncs on reconnect, and retries with 30 s / 1 m / 2 m / 5 m backoff while active and failing. Sync also runs on cold start.

## Public food catalog

`public.foods` public rows (no `user_id`) are the Open Food Facts US subset (about 214k rows, built by `scripts/off-subset/`). `food_popularity` is server-only ranking data and is never synced. `search_foods` remains the original `(q text, exclude_ids text[], max_results integer)` RPC with unchanged output columns and authenticated-only execution. It is `SECURITY DEFINER` with empty search_path, checks a live account and explicitly restricts every candidate branch to public or caller-owned rows. Legacy exclusion arrays remain supported; new clients send only the normalized query and result limit, then dedupe locally.

`202610230006_food_search_bitmap_candidates.sql` retains005's strong path and replaces fallback set operations with a single indexed AND of per-token FTS OR optional trigram predicates. This preserves candidate semantics while allowing BitmapAnd/BitmapOr before heap access. Materialized quality runs once per candidate; no lexicon or user schema is added.004/005 remain deployed history; schema reflects006.

`202610230005_food_search_candidate_intersection.sql` replaces the RPC after004: materialized strong FTS results return early only when they fill the caller's requested limit; otherwise indexed per-token FTS/trigram supersets are intersected before quality is evaluated once. No arbitrary candidate cap is introduced. It initializes pg_trgm and sets its threshold transaction-locally inside the body for cold backend safety. Live verification uses one RPC per request under `supabase/tests/food-search-live-probes/`.

`202610230004_food_search_relevance.sql` adds an expression GIN index over explicit `simple`-dictionary FTS of normalized name/brand text, retaining the existing combined trigram index. Immutable invoker helpers normalize NFD/combining marks and implement bounded per-token matching. Indexed exact/prefix and `%>>` typo candidate branches feed the all-word gate before ranking/limit. Capped popularity stays inside quality buckets. No user-table, local SQLite, sync or tombstone schema changes are needed. Apply SQL before releasing clients; verify production index plans and authenticated old/new RPC calls. See [deployment and rollback notes](../food-search-relevance.md). Search summaries stay transient with runtime completeness markers; only full remote profiles enter SQLite.

`has_live_account()` (the restrictive `live_account_required` policy on every user table) takes `FOR KEY SHARE` on the caller's `auth.users` row only in read-write transactions, so `delete_own_account` waits for in-flight writes. PostgREST runs GET requests and `STABLE` RPCs read-only, where a row lock fails with HTTP 405, so reads only check that the account exists.

## Export

`lib/export.ts` is pure CSV export: `rangeDates`, `buildExportRows`, `toCsv`, `exportFileName`. The file write and share is in `lib/export-file.ts` (`.web.ts` downloads).

## Weekly volume targets on goals

`user_goals.weekly_volume_targets` is an optional local map of eligible muscle regions to integer weekly sets (1 through 40), backed by a non-null JSONB object with an empty-object default in Supabase. Legacy missing or malformed values normalize to an empty map. Nutrition-only saves preserve targets; explicit empty maps clear them. Target saves retain macros and clear sync acknowledgment. Goal read-modify-write operations are serialized, and acknowledgment checks the pushed `updated_at` version. Restore replaces the map, including clearing old account targets when a remote legacy record has no map; sign-out wipes the whole goals key. Account merge retains existing-account-wins semantics.

Apply only `supabase/migrations/202610230003_weekly_volume_targets.sql` before shipping this client. The additive migration preserves existing goal values and timestamps and is safe to repeat. Do not rerun historical RLS phases from schema.sql. Verify the deployed column/default and own-account persistence and restore. Older clients omit this column on cloud upserts, preserving its server value, but cannot understand targets during offline local edits.

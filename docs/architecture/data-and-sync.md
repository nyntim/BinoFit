# Data, tombstones and sync

## Storage layers

- SQLite (`lib/database.ts`, wrapping `expo-sqlite`): foods, food logs, meals, weight entries (`lib/weight.ts`) and training tables (`lib/workouts/schema.ts`, called from `initSchema`).
- AsyncStorage (`lib/storage.ts`): goals, profile, device preferences, quick-add drinks, sync timestamps. See [preferences.md](preferences.md).
- Supabase (`lib/supabase.ts`): cloud sync and backup. Every install has a session (see [auth.md](auth.md)). Session tokens live in the Keychain via `lib/secure-session-storage.ts`.

## `lib/database.ts`

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

## Export

`lib/export.ts` is pure CSV export: `rangeDates`, `buildExportRows`, `toCsv`, `exportFileName`. The file write and share is in `lib/export-file.ts` (`.web.ts` downloads).

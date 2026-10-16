# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Style

- **Complex tasks**: Always create a todo list using `TaskCreate` at the start, update each task to `in_progress` when starting it, and mark `completed` when done.
- **Commit messages**: Never include any reference to Claude, AI, or assistant-generated content (no "Claude", no `claude.ai` URLs, no session links) in commit messages.
- **Branch names**: Never include "claude" or any AI/assistant reference in branch names.
- **Commit author**: Never use "Claude" or any AI identity as the git commit author. Always use the repo owner's identity.

## Development Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start Metro dev server |
| `npm run ios` | Open iOS simulator |
| `npm run android` | Open Android emulator |
| `npm run web` | Open in browser |
| `npm run lint` | Run ESLint |
| `npx expo start --web` | Start web mode (alternative) |
| `npm test` | Run tests (if configured) |
| `npm run watch` | Start watch mode |
| `npm run ship -- <cmd>` | Parallel feature worktrees (`start`, `status`, `rebase`, `land`, `clean`); see `docs/agents/ship.md` |

## Project Architecture

**Routing** — Expo Router v6 with file-based routing. App structure:
- `app/` — File-based routes using Expo Router
  - `(tabs)/` — Bottom tab navigator: `index` (dashboard), `exercise`, `progress`, `settings`
  - `onboarding/` — Welcome → goals → complete flow
  - `food-search.tsx`, `serving-picker.tsx`, `custom-food.tsx` — Feature screens
  - `barcode-scanner.tsx` — Full-screen camera scanner (native only; reached from the food-search scan button). Looks up via `lookupBarcode`, then replaces itself with `serving-picker`, or `custom-food` (prefilled, with barcode) when not found
  - `day-detail.tsx` — Day history view
- `components/` — Reusable UI components
  - `calorie-ring.tsx`, `macro-bar.tsx` — Nutrition visualizations
  - `CalendarWidget.tsx` — Week strip + full-month modal calendar (uses `react-native-calendars`)
  - `StreakBadge.tsx` — Current logging streak display
  - `month-calendar.tsx` — Standalone month calendar
  - `ui/icon-symbol.tsx` — Platform-specific icon wrapper (`.ios.tsx` variant)
- `lib/` — Core utilities
- `hooks/` — Custom hooks
- `context/` — React Context providers

**Platform files** — `.ios.tsx` and `.web.ts` suffixes are resolved by Metro. Use this pattern instead of `Platform.OS` branching when behaviors diverge.

**Path aliases** — `@/*` maps to repo root. Import using `@/components/...`, `@/lib/...`, `@/hooks/...`.

**Database** — `lib/database.ts` wraps `expo-sqlite` with functions:
- `getFoodLogsWithFoodByDate()` — Get daily meal logs with joined food data
- `addCustomFood()` — Insert custom food entries
- `deleteFoodLog()` — Remove food log entries
- `getLoggedDates()` — Get history date range
- `getUnsyncedFoodLogs()` / `markFoodLogsSynced()` — Sync tracking for Supabase
- `getMealDefinitions()` / `getMealNames()` / `countFoodLogsForMeal()` — User-defined meals (seeded once with the four defaults)
- `saveMealDraft()` — Applies the dashboard edit-mode draft (adds, renames, order, targets, deletes) in one transaction
- `getUnsyncedMealDefinitions()` / `markMealDefinitionsSynced()` / `getUnsyncedMealNames()` / `markMealNamesSynced()` — Sync tracking
- `cacheRemoteFood()` — Cache remote food search results locally (also stores `barcode`)
- `getFoodByBarcode()` — Local lookup by normalized barcode (custom food first, then most recent); `foods.barcode` is device-only, not synced

**Theming** — Three-layer system:
1. `constants/theme.ts` — Color palette (light/dark), macro colors, fonts
2. `hooks/use-theme-color.ts` — Component-level theme accessor
3. `ThemedText` / `ThemedView` — Themed components

Use `useThemeColor` in components; don't read `Colors` directly.

**Storage** — Three-layer storage system:
- SQLite (`lib/database.ts`) — Meals, food database, logs
- AsyncStorage (`lib/storage.ts`) — User goals, profile, preferences, quick-add drinks, default log status (eaten | planned)
- Supabase (`lib/supabase.ts`) — Cloud sync; anonymous device-based identity (no auth)

**Supabase sync** — `lib/sync.ts` pushes unsynced local data to Supabase. Fire-and-forget; never throws. Tables: `food_logs`, `user_goals`, `user_profile`, `foods`.

**Sync status** — `lib/sync-status.ts` is a pub/sub store (`status`, `lastSuccessAt`, `failingSince`, `isOffline`) fed by `syncToSupabase()`, which throws per-step on Supabase `{ error }`, runs every step (`allSettled`), and coalesces calls made mid-sync into one extra pass. `deriveIndicator` hides failures for a 30s grace period. UI: `useSyncStatus`, `components/SyncIndicator.tsx` (dashboard pill, tap retries), Settings "Last synced" row (`getLastSyncAt`/`setLastSyncAt` in `lib/storage.ts`). `useSyncAutoRetry` (mounted in `app/_layout.tsx`) tracks NetInfo, syncs on reconnect, and retries with 30s/1m/2m/5m backoff while active and failing. Sync also runs on cold start.

**Food search** — `lib/food-service.ts` searches SQLite first; falls back to Supabase remote query (≥4 chars) and caches results locally.

**Barcode scan** — `lib/open-food-facts.ts` (`normalizeBarcode`, `mapOffProduct`, `buildServingUnits`, `fetchOffProduct`; never throws, 8s timeout) maps Open Food Facts products to `Food` rows (`id: off:{barcode}`, `source: 'open_food_facts'`). `lookupBarcode()` in `lib/food-service.ts` checks SQLite, then OFF, and caches found products; not-found/errors are never cached.

**Device identity** — `lib/device-id.ts` generates and persists a UUID via AsyncStorage. Used as `user_id` for all Supabase rows instead of auth.

## Key Files

- `app.json` — Expo config, plugins, native module settings
- `tsconfig.json` — TypeScript config with strict mode, path aliases
- `eslint.config.js` — ESLint rules
- `lib/database.ts` — SQLite schema and CRUD operations
- `lib/types.ts` — TypeScript types for Food, FoodLog, UserGoals, UserProfile, WaterLog, QuickAddDrink
- `lib/storage.ts` — AsyncStorage wrappers (goals, profile, preferences, sync timestamps)
- `lib/supabase.ts` — Supabase client (no auth; reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
- `lib/sync.ts` — Fire-and-forget sync to Supabase; call after any write or on app foreground
- `lib/export.ts` — Pure CSV export: `rangeDates`, `buildExportRows`, `toCsv`, `exportFileName` (file write/share in `lib/export-file.ts`, `.web.ts` downloads)
- `lib/food-service.ts` — Food search with local-first + remote fallback
- `lib/device-id.ts` — Persistent anonymous device UUID
- `constants/theme.ts` — Theme colors, macro colors, fonts
- `supabase/schema.sql` — Supabase DB schema

## Data Model

```typescript
Food = { id, name, brand, serving_units, calories, protein, carbs, fat, source, updated_at }
MealId = string  // MealSlot is an alias; food_logs.meal_slot holds a meal id
MealDefinition = { id, position, calorie_target, protein_target, carb_target, fat_target (number|null), reminder_time ('HH:mm'|null), created_at, updated_at, synced_at? }
MealNameEntry = { meal_id, name, effective_from (yyyy-MM-dd), updated_at, synced_at? }  // name history; renames apply from today
FoodLog = { id, date, meal_slot, food_id, serving_amount, serving_unit, created_at, updated_at, synced_at? }
MealSlotConfirmation = { id, date, meal_slot, confirmed, updated_at }
UserGoals = { calorie_goal, protein_goal, carb_goal, fat_goal, updated_at }
UserProfile = { weight, height, activity_level, updated_at }
WaterLog = { id, date, amount, drink_name, created_at }
QuickAddDrink = { id, name, amount, food_id? }
```

## Development Tips

- Use `@/` path aliases instead of relative imports
- Respect platform-specific files (`.ios.tsx`, `.web.ts`)
- Use `expo-router` navigation via `router.push()` and `router.back()`
- Calorie ring and macro bars are visualizations in `components/calorie-ring.tsx` and `components/macro-bar.tsx`
- Date context via `@/context/DateContext` for day navigation
- Swipe-to-navigate day via `@/hooks/useSwipeDayNavigation`
- Meals are user-defined: resolve names with `nameForDate` / `mealsForDay` from `@/lib/meals` (via `@/hooks/useMealDefinitions`), never hardcode slot labels. Dashboard Edit mode edits a draft (`@/hooks/useMealDraft`) saved on Done; drag-reorder is `components/dashboard/ReorderableList.tsx`
- Meal reminders: `lib/reminders.ts` (`expo-notifications`, local only). `syncMealReminders(defs, names)` cancels all `meal-reminder:<id>` notifications and reschedules one daily notification per meal with `reminder_time`; call `restoreMealReminders()` (fire-and-forget) after saving meals and on app start. Permission is requested only when a reminder is turned on (`MealSettingsSheet`)
- Streak data via `@/hooks/useStreak` (current + longest streak from logged dates)
- Apple HealthKit integration (iOS only) via `@/hooks/use-health-kit` — reads steps/active calories, writes nutrition
- Call `syncToSupabase()` from `@/lib/sync` fire-and-forget after any food log write; never await inline

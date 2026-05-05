# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Project Architecture

**Routing** — Expo Router v6 with file-based routing. App structure:
- `app/` — File-based routes using Expo Router
  - `(tabs)/` — Bottom tab navigator: `index` (dashboard), `exercise`, `progress`, `settings`
  - `onboarding/` — Welcome → goals → complete flow
  - `food-search.tsx`, `serving-picker.tsx`, `custom-food.tsx` — Feature screens
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
- `cacheRemoteFood()` — Cache remote food search results locally

**Theming** — Three-layer system:
1. `constants/theme.ts` — Color palette (light/dark), macro colors, fonts
2. `hooks/use-theme-color.ts` — Component-level theme accessor
3. `ThemedText` / `ThemedView` — Themed components

Use `useThemeColor` in components; don't read `Colors` directly.

**Storage** — Three-layer storage system:
- SQLite (`lib/database.ts`) — Meals, food database, logs
- AsyncStorage (`lib/storage.ts`) — User goals, profile, preferences, quick-add drinks, plan mode flag
- Supabase (`lib/supabase.ts`) — Cloud sync; anonymous device-based identity (no auth)

**Supabase sync** — `lib/sync.ts` pushes unsynced local data to Supabase. Fire-and-forget; never throws. Tables: `food_logs`, `user_goals`, `user_profile`, `foods`.

**Food search** — `lib/food-service.ts` searches SQLite first; falls back to Supabase remote query (≥4 chars) and caches results locally.

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
- `lib/food-service.ts` — Food search with local-first + remote fallback
- `lib/device-id.ts` — Persistent anonymous device UUID
- `constants/theme.ts` — Theme colors, macro colors, fonts
- `supabase/schema.sql` — Supabase DB schema

## Data Model

```typescript
Food = { id, name, brand, serving_units, calories, protein, carbs, fat, source, updated_at }
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
- Streak data via `@/hooks/useStreak` (current + longest streak from logged dates)
- Apple HealthKit integration (iOS only) via `@/hooks/use-health-kit` — reads steps/active calories, writes nutrition
- Call `syncToSupabase()` from `@/lib/sync` fire-and-forget after any food log write; never await inline

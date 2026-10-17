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
| `npm start` | Start Metro dev server (iOS/Android only; `expo.platforms` excludes web) |
| `npm run ios` | Open iOS simulator |
| `npm run android` | Open Android emulator |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests (if configured) |
| `npm run watch` | Start watch mode |
| `npm run ship -- <cmd>` | Parallel feature worktrees (`start`, `status`, `rebase`, `land`, `clean`); see `docs/agents/ship.md` |

## Project Architecture

**Routing** — Expo Router v6 with file-based routing. App structure:
- `app/` — File-based routes using Expo Router
  - `(tabs)/` — Bottom tab navigator: `index` (dashboard), `training` (week summary, last 3 workouts, entry rows), `progress`, `settings`. Home is hidden in Training mode and Training in Nutrition mode (`href: null`); Progress and More always show
  - `onboarding/` — Welcome → mode (`mode.tsx`: Nutrition / Training / Both) → goals → complete flow; Training mode skips goals and complete and lands on the Training tab
  - `food-search.tsx`, `serving-picker.tsx`, `custom-food.tsx` — Feature screens
  - `barcode-scanner.tsx` — Full-screen camera scanner (native only; reached from the food-search scan button). Looks up via `lookupBarcode`, then replaces itself with `serving-picker`, or `custom-food` (prefilled, with barcode) when not found
  - `day-detail.tsx` — Day history view
  - `workout/exercises.tsx`, `workout/new-exercise.tsx` — Exercise library/picker and builder (root-stack screens, linked from the Training tab)
  - `workout/log.tsx` (Log past workout modal), `workout/[id].tsx` (finished workout: view, edit, delete), `workout/history.tsx` (all finished workouts by month, 30 per page), `workout/session.tsx` (live session, fullScreenModal). All workout routes are registered on the root Stack in `app/_layout.tsx`
- `components/` — Reusable UI components
  - `calorie-ring.tsx`, `macro-bar.tsx` — Nutrition visualizations
  - `CalendarWidget.tsx` — Week strip + full-month modal calendar (uses `react-native-calendars`)
  - `StreakBadge.tsx` — Current logging streak display
  - `month-calendar.tsx` — Standalone month calendar (themed, `weekStartsOn`, future days disabled; used by the Progress Consistency card)
  - `ui/icon-symbol.tsx` — Platform-specific icon wrapper (`.ios.tsx` variant)
- `lib/` — Core utilities
- `hooks/` — Custom hooks
- `context/` — React Context providers

**Platform files** — `.ios.tsx` and `.web.ts` suffixes are resolved by Metro. Use this pattern instead of `Platform.OS` branching when behaviors diverge.

**Path aliases** — `@/*` maps to repo root. Import using `@/components/...`, `@/lib/...`, `@/hooks/...`.

**Database** — `lib/database.ts` wraps `expo-sqlite` with functions:
- `getFoodLogsWithFoodByDate()` — Get daily meal logs with joined food data
- `addCustomFood()` — Insert custom food entries
- `deleteFoodLog()` — Tombstones a food log (sets `deleted_at`); see Tombstones below
- `getLoggedDates()` — Get history date range
- `getUnsyncedFoodLogs()` (includes tombstones) / `markRowsSynced()` from `lib/tombstones.ts` — Sync tracking for Supabase
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
- Supabase (`lib/supabase.ts`) — Cloud sync and backup; every install has a Supabase session (anonymous, or Apple sign-in on iOS). Session tokens live in the Keychain via `lib/secure-session-storage.ts`

**Supabase sync** — `lib/sync.ts` pushes unsynced local data to Supabase. Fire-and-forget; never throws. Tables: `food_logs`, `weight_entries`, `user_goals`, `user_profile`, `foods`, `meal_definitions`, `meal_names`, `exercises` (custom only), `workouts` (status `done` only), `workout_exercises`, `workout_sets`.

**Sync status** — `lib/sync-status.ts` is a pub/sub store (`status`, `lastSuccessAt`, `failingSince`, `isOffline`) fed by `syncToSupabase()`, which throws per-step on Supabase `{ error }`, runs every step (`allSettled`), and coalesces calls made mid-sync into one extra pass. `deriveIndicator` hides failures for a 30s grace period. UI: `useSyncStatus`, `components/SyncIndicator.tsx` (dashboard pill, tap retries), Settings "Last synced" row (`getLastSyncAt`/`setLastSyncAt` in `lib/storage.ts`). `useSyncAutoRetry` (mounted in `app/_layout.tsx`) tracks NetInfo, syncs on reconnect, and retries with 30s/1m/2m/5m backoff while active and failing. Sync also runs on cold start.

**Training preferences** — Device-only, in AsyncStorage (`lib/storage.ts`: tracking mode, weight unit, Show RPE, active rest timer). `lib/app-preferences.ts` is a pub/sub store loaded once at launch (`loadPreferences`, write-through setters); read it with `usePreferences`. Sign-out clears tracking mode and rest timer, keeps unit and RPE. `lib/units.ts` is pure: weight is stored in kg and distance in metres; display follows the unit (kg with km, lb with mi). UI: `components/settings/TrainingSection.tsx` (Track, Units, Show RPE).

**Tracking mode** — `lib/tracking-mode.ts` (pure): `isTabVisible(tab, mode)` and `homeRouteFor(mode)` (`/(tabs)/training` for training, else `/(tabs)`). Every navigation to the app's home must use `homeRouteFor(getPreferences().trackingMode)`, never a literal `/(tabs)`. Unset mode reads as `both`. `app/index.tsx` waits for preferences before routing. Training mode hides Settings > Daily Goals and "Default for new food" and Save skips goal validation; switching to Nutrition/Both with no goals shows a "Set goals" card. Reset Setup keeps the mode. `hasRestoredData(summary)` in `lib/restore.ts` (goals, logs, weight entries or workouts; meals alone do not count) decides whether a restore completes onboarding and whether `routeAfterAuth` returns `tabs` or `mode`.

**Tombstones** — Deleting a synced row never calls Supabase directly. `lib/tombstones.ts`: `tombstoneSql(table)` sets `deleted_at`, `updated_at` and `synced_at = NULL`; sync pushes `deleted_at`, then `purgeSyncedTombstones(table)` removes synced tombstones (nothing is purged if the push errors). Every read of `food_logs` must filter `deleted_at IS NULL` (a missed filter resurrects deleted food); `getUnsyncedFoodLogs` is the only read that returns tombstones. Writes to a log guard `deleted_at IS NULL`. `markRowsSynced(table, [{id, updated_at}])` marks only rows unchanged since the push, so an edit made during a push stays unsynced (meal_definitions / meal_names still use the old id-only mark functions). Restore passes tombstones to `applyRemoteFoodLogs`, which uses `decideRemoteApply` (newer remote tombstone deletes local, tombstone with no local row is skipped, else last-write-wins, ties keep local). `saveMealDraft` tombstones a deleted meal's logs. New synced tables (Phase 4 training) follow the same rules.

**Weight log** — `lib/weight.ts`: SQLite `weight_entries` (created by `initWeightSchema` from `initSchema`; tombstoned like food logs, allow-listed in `lib/tombstones.ts`; weight always kg, display via `lib/units`). The UI keeps one entry per day: `saveWeightEntry({date?, weight_kg})` updates the day's latest live row or inserts (`measured_at` = now for today, local noon for backdated; range 20-400 kg, `weightInputToKg` / `weightRangeMessage` validate display input); `deleteWeightEntriesForDate` tombstones the whole day. Reads: `getLatestWeightEntry`, `getWeightOnOrBefore(date)`, `getRecentWeightDays(n)` (all exclude tombstones), `getUnsyncedWeightEntries` (includes them). The latest entry is canonical: `syncProfileWeightFromLatest()` writes `profile.weight` only when it differs (a backdated entry never changes it; with no entries left the profile is untouched). Pure: `collapseLatestPerDay`, `pickLatest`, `resolveBodyweightKg(entry, profile)` (entry, else profile.weight, else null). Sync (`syncWeightEntries`) and restore (`applyRemoteWeightEntries` after the profile, `RestoreSummary.weightEntriesRestored`) follow the tombstone rules; wipe deletes the table. Call `syncToSupabase()` after every write. UI: Progress tab `components/progress/WeightCard.tsx` + `WeightEntrySheet.tsx` (`hooks/useWeightEntries.ts`), Settings weight field (shows the latest entry, saves an entry only when changed), onboarding goals weight field. Shown in every tracking mode.

**Workouts (Phase 4, native only)** — `lib/workouts/schema.ts` (`initWorkoutSchema`, called from `initSchema`) creates `app_meta`, `exercises`, `workouts`, `workout_exercises`, `workout_sets` (kg, metres, seconds; all with `created_at/updated_at/synced_at/deleted_at`; one `active` workout enforced by a partial unique index). `lib/workouts/db.ts` is the data API (create/update/delete workouts, exercises, sets; `getWorkoutWithExercises` shows "Unknown exercise" for a missing definition; `ActiveWorkoutExistsError`). Active and draft sessions never sync and are hard-deleted; done workouts and children are tombstoned. `syncWorkoutTree` in `lib/sync.ts` snapshots the four unsynced sets, pushes exercises, workouts, workout_exercises, sets, marks synced via `markRowsSynced` and purges tombstones (exercise tombstones that past workouts still reference are kept). Restore: `lib/workouts/restore-apply.ts` (custom exercises first, then the tree in one transaction, forced `done`, `decideRemoteApply`); `clearUserData` removes workouts and custom exercises but keeps seeds.

**Exercise library and builder (native only)** — `lib/workouts/exercise-seed.ts`: 46 built-in `exercises` (slug ids, `source = 'seed'`), upserted by `seedExercises(db)` from `initWorkoutSchema` only when `app_meta.exercise_seed_version` is below `EXERCISE_SEED_VERSION` (bump it when the list changes; seeds are never synced or wiped, dropped ids get `hidden = 1`, custom rows are untouched). Pure: `exercise-catalog.ts` (labels, `MUSCLE_REGION`, `REGIONS`, `exerciseDisplayName` "Name · Brand", `exerciseSubtitle`, `filterExercises` ranked exact > prefix > word prefix > substring and excluding hidden/deleted, `splitSections`) and `exercise-builder.ts` (draft state keyed by step id: `builderSteps`, `isStepValid`, `primaryLabel` Next/Skip/Save, `applyEquipment`, `toggleMuscle`, `nameSuggestions`, `reviewRows`, `draftToExerciseInput`; the sled weight is typed in the display unit and stored in kg). CRUD in `lib/workouts/exercises.ts` (`getExercises`, `getExerciseById` includes tombstones, `createCustomExercise`, `updateCustomExercise`, `deleteCustomExercise` tombstones, `getCustomExerciseBrands`); `lib/workouts/format.ts` `workoutDisplayName`. Screens are registered directly on the root Stack in `app/_layout.tsx` (no nested workout layout): `workout/exercises` (library; `pick=1&workoutId=` makes it a modal picker that calls `addExerciseToWorkout`) and `workout/new-exercise` (guided builder modal; params `name`, `workoutId`, `id` for edit, which opens at review). After saving from pick mode, Done calls `router.dismiss(2)` (builder + picker). Discard confirmations use native `Alert` and `usePreventRemove`. Components in `components/workouts/`. Call `syncToSupabase()` after every exercise write.

**Workout editor and log afterward (native only)** — One editor for Log past workout (`mode 'manual'`, a draft), finished workouts (`'edit'`) and the live session (`'live'`, C9). `hooks/useWorkoutEditor(id, mode)` holds the `WorkoutWithExercises` in state (pure `editorReducer` in `lib/workouts/editor-state.ts`) and writes every action through a serial `createWriteQueue` (`lib/workouts/write-queue.ts`; sets get client ids via the optional `id` in `addWorkoutSet`/`addWorkoutExercise`, so add-then-edit keeps order; a failed write reloads from SQLite). Numeric cells (`NumericCell`) commit 300 ms after typing stops and on blur; times are digits filled from the right (`parseClockDigits`). `mode 'edit'` calls `syncToSupabase()` after writes; leaving `workout/[id]` runs `cleanupEmptyEntries`. UI: `components/workouts/WorkoutEditor.tsx` (`WorkoutEditorBody`: meta card, `ExerciseBlock` per exercise, `SetTableHeader`, `SetRow` with optional Done column, `SetTypeSheet`, `OptionsSheet`, `AddExercisesButton`); columns, badges (W/D/F, numbered normal sets) and cell text/parsing come from `editor-state.ts` (`setColumns`, `setBadges`, `cellText`, `cellPatch`, `applySchedule`). Pure rules: `prefill.ts` (`prefillSets`, `resolveRestSeconds` last > exercise default > 90, 0 = off, `previousFor`, `formatPreviousSet`), `volume.ts` (`setVolumeKg`, `workoutVolumeKg`: warmups excluded, per side x2, bodyweight counts added load, plate-loaded counts logged plates only, assisted/time/distance 0), `completion.ts` (`isSetFilled`, `planSave`, `tickPatch`: ticking an empty set copies Previous). DB: `lib/workouts/previous.ts` (`getPreviousPerformance` = latest earlier done workout with the exercise, set by index; `addExerciseToWorkout` adds the link with resolved rest and prefilled unticked sets in one transaction) and `lib/workouts/drafts.ts` (`getOrCreateDraft` reopens the newest draft, else today / start now -1 h / 1:00; `saveDraft` -> 'saved' | 'empty'; `cancelDraft` hard-deletes; `purgeStaleDrafts` removes drafts with no activity for over 7 days on launch; `applyCompletionPlan`). `lib/workouts/active-workout-store.ts` (+ `hooks/useActiveWorkout`) is the pub/sub store of the active workout (`refreshActiveWorkout` on launch, `setActiveWorkout`). `db.ts` also exports `insertWorkoutExercise`, `insertWorkoutSet`, `buildWorkoutExerciseRow`, `buildWorkoutSetRow`, `nextExercisePosition`, `nextSetPosition`, `updateWorkoutExercise`. `components/time-picker-sheet` takes `mode` ('time' | 'date'), `maximumDate`, `title`.
**Training tab (native only)** — `app/(tabs)/training.tsx`: primary button "Start empty workout" / "Resume workout" (when `useActiveWorkout` has one) pushes `/workout/session`; `WeekSummaryCard` (Monday to Sunday by workout `date`: sessions, volume in the display unit, time); History card with the last 3 done workouts (`WorkoutHistoryRow` opens `/workout/[id]`, "All workouts" opens `/workout/history`); Exercises and Log past workout rows. Pure `lib/workouts/summary.ts` (`weekRange`, `formatWeekRange`, `summarizeWorkout`, `summarizeWeek`, `formatDurationShort`, `formatVolume`, `workoutTitle`, `groupByMonth`); reads in `lib/workouts/history.ts` (`getDoneWorkoutsBetween`, `getRecentDoneWorkouts(limit, offset)`, batched, done only); hooks `useTrainingOverview`, `useWorkoutHistory` (reload on focus). Types `WorkoutSummary`, `WeekSummary` in `lib/types.ts`.

**Live session and session bar (native only)** — `lib/workouts/session.ts`: `STALE_AFTER_MS` (6 h), `startEmptyWorkout(now)` (creates the `active` workout; a double start returns the existing one), `lastActivityAt(w)` (latest ticked set, else start), `isStale(w, now)` (>= 6 h since then), `finishWorkout(id, {endAt?, discardUnticked}, now)` -> 'finished' | 'needs-confirm' | 'empty' | 'gone' (missing or no longer active), `discardActiveWorkout(id)`; both end by calling `setActiveWorkout(null)`. `planFinish(w, now, opts)` in `completion.ts` is the pure rule: ticked sets stay, unticked sets without data are dropped, unticked sets with data need confirmation (then dropped), exercises left empty are removed, no ticked set means 'empty', duration is `endAt` (default now, clamped to start..now) minus start, and the workout is dated by its start. `lib/workouts/finish-flow.ts` holds the native Alerts (`confirmAndFinish(id, endAt?)`, `confirmAndDiscard(id)`: "No completed sets", "Unfinished sets" / "Discard and finish", "Discard this workout?"). `hooks/useStaleSessionPrompt` (mounted in `app/_layout.tsx`) asks "Still training?" (Finish at last set / Keep going / Discard) on launch and foreground; any cancelled outcome snoozes 6 h in memory; skipped while `/workout/session` is open. `hooks/useNow(intervalMs, enabled)` is a ticking clock. `app/workout/session.tsx` starts a workout itself when none is active, shows `WorkoutEditorBody` in mode 'live' (`showMeta={false}`, Discard as `footer`), minimizes with the chevron or Android back, and on Finish goes to `/workout/[id]`. `components/workouts/ActiveWorkoutBar.tsx` (`detail` prop for C10's "Rest 1:24", `elapsedSeconds`) is drawn above `BottomTabBar` by the custom `tabBar` in `app/(tabs)/_layout.tsx` (hidden while the keyboard is open; `BottomTabBar` comes from `expo-router/js-tabs`).

**Rest timer and notifications (native only)** — `lib/workouts/rest-timer.ts` (pure, `now` passed in): `startRest` (null when 0 = off), `remainingSeconds` (ceil), `adjustRest` (+/-15 s on the absolute `endsAt`; a -15 with 15 s or less left returns null = ends), `restoreRest(stored, activeWorkoutId, now)` (kept only for the active workout and before `endsAt`), `restNotificationBody`. `RestTimerState` also carries optional `workoutExerciseId` / `exerciseName` (kept by `parseRestTimer`). `lib/workouts/rest-notifications.ts` (mockable, serialised, never throws, no-op on web): `REST_TIMER_PREFIX` `rest-timer:`, Android channel `rest-timer`, `ensureRestPermission(prompt)` (asks at most once, only while undetermined; denied = timer still runs in-app), `scheduleRestNotification` (DATE trigger, id `rest-timer:<workoutId>`, replaces the existing one; "Rest over" / "Next set: <exercise>.", sound), `cancelRestNotification`, `cancelAllRestNotifications`. `lib/workouts/rest-timer-store.ts` is the pub/sub store kept in step with AsyncStorage and the notification: `startRestTimer` (prompts for permission on first start), `adjustRestTimer`, `stopRestTimer(workoutId?)`, `expireRestTimer`, `restoreRestTimer(activeWorkoutId)` (launch, re-arms without prompting; stale or other-workout timers are cleared), `clearRestTimerAndNotifications` (called by `finishWipe`). `finishWorkout` and `discardActiveWorkout` call `stopRestTimer`. `hooks/useRestTimer` derives the countdown; `RestBanner` ("Rest · <exercise>", -15s, +15s, Skip) is pinned between the session header and the scrolling editor, `RestPickerSheet` is the "Rest time" exercise option, and `ActiveWorkoutBar` appends "Rest 1:24". `WorkoutEditorBody` takes `onToggled`; the session starts the rest after every tick (warmups too; exercise rest, else 90 s, 0 = off) and cancels it only when the set that started it is unticked (`stopRestTimerForSet`); `RestTimerState` also keeps `setId`. `configureNotificationHandler` hides the foreground banner for `rest-timer:*`.

**Progress tab** — `lib/progress.ts` (pure, `today` passed in): `rangeBounds`, `enumerateDates`, `buildDailyTotals` (eaten logs only via `isSlotEaten`; `anyLogs` also counts planned), `summarize` (averages skip today and empty days), `bucket` (Monday weeks), `bucketFor` (All: weeks up to 182 days, then months), `chartScale`. `lib/streak.ts` `computeStreaks(dates, today)` feeds `useStreak` with the local date (`getAllLoggedDates(today)` no longer uses UTC). `hooks/useProgress(range)` loads in `useFocusEffect`. UI in `components/progress/` (`RangeChips`, `CalorieTrendChart`, `AveragesCard`, `ConsistencyCard`, plus the weight card). `MonthCalendar` takes `today`, `weekStartsOn` and theme colors; `MacroBar` takes an optional `goal` and `trackColor`. Daily bars and past calendar days push `/day-detail`, which reloads on focus.

**Food search** — `lib/food-service.ts` searches SQLite first; falls back to Supabase remote query (≥4 chars) and caches results locally.

**Barcode scan** — `lib/open-food-facts.ts` (`normalizeBarcode`, `mapOffProduct`, `buildServingUnits`, `fetchOffProduct`; never throws, 8s timeout) maps Open Food Facts products to `Food` rows (`id: off:{barcode}`, `source: 'open_food_facts'`). `lookupBarcode()` in `lib/food-service.ts` checks SQLite, then OFF, and caches found products; not-found/errors are never cached.

**Identity** — `lib/auth.ts`: `initAuth()` (on launch) ensures a session via `signInAnonymously()`, claims legacy device-UUID rows once (`claim_device_data` RPC), redeems any pending merge ticket and triggers a sync. `user_id` on all Supabase rows is `getSessionUserId()` (`auth.uid()::text`). `lib/device-id.ts` is legacy: read only for the one-time claim. Sync skips silently while there is no session. Failed anonymous sign-ins are throttled to one per 30 s (`force` bypasses it for user actions); a restored anonymous session is validated once per launch with `getUser()` and replaced if its user is gone. Problems are recorded by `lib/auth-debug.ts` (`reportAuthIssue`, `getLastAuthIssue`; console warning in `__DEV__`, shown in Settings > Account in dev).

**Account (email + Apple)** — Offered first in onboarding (`app/onboarding/index.tsx`, `app/onboarding/account.tsx`) and in Settings (`components/settings/AccountSection.tsx`, modal `app/account.tsx`). Shared form `components/auth/AuthForm.tsx` (modes signUp, signIn, resetRequest, resetVerify, changePassword, confirmEmail); validation and error copy in `lib/auth-validation.ts`; navigation after auth is the pure `routeAfterAuth` in `lib/auth-routing.ts`. `signUpWithEmail()` converts the anonymous user in place with `updateUser({ email, password })` + `refreshSession()` (same uid: no ticket, merge or restore); with "Confirm email" on it returns `confirmEmail` and `verifyEmailCode()` finishes with `verifyOtp(type 'email_change')`. `signInWithEmail()`, `verifyPasswordReset()` (recovery code) and `signInWithApple()` all go through `signInWithMerge(obtainSession)`, the ticket flow described next. `AuthState.method` is `'apple' | 'email' | null`. `signInWithMerge` makes a merge ticket as the anonymous user, signs in with Apple, redeems the ticket (existing account wins), then `lib/restore.ts` `restoreFromAccount()` pulls logs, meals, goals and profile (account replaces local goals/profile/meals; logs last-write-wins). `signOutAndWipe()` (after `prepareSignOut()` and a UI warning) signs out locally, wipes user data and starts a new anonymous session. Water logs, confirmations and quick-add drinks do not sync yet. UI: `components/settings/AccountSection.tsx`, onboarding restore link. Hooks: `useAuth`.
RLS is deployed in two steps in `supabase/schema.sql` (STEP A then STEP B); both are applied to production, so every user-data table is own-rows-only for `authenticated`.

## Key Files

- `app.json` — Expo config, plugins, native module settings
- `tsconfig.json` — TypeScript config with strict mode, path aliases
- `eslint.config.js` — ESLint rules
- `lib/database.ts` — SQLite schema and CRUD operations
- `lib/types.ts` — TypeScript types for Food, FoodLog, WeightEntry, UserGoals, UserProfile, WaterLog, QuickAddDrink
- `lib/storage.ts` — AsyncStorage wrappers (goals, profile, preferences, sync timestamps)
- `lib/auth.ts` — Session, Apple sign-in, sign-out wipe; `lib/restore.ts` — restore from account
- `lib/supabase.ts` — Supabase client (anonymous or Apple session; reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`)
- `lib/sync.ts` — Fire-and-forget sync to Supabase; call after any write or on app foreground
- `lib/export.ts` — Pure CSV export: `rangeDates`, `buildExportRows`, `toCsv`, `exportFileName` (file write/share in `lib/export-file.ts`, `.web.ts` downloads)
- `lib/food-service.ts` — Food search with local-first + remote fallback
- `lib/device-id.ts` — Legacy device UUID (only used to claim old rows)
- `constants/theme.ts` — Theme colors, macro colors, fonts
- `supabase/schema.sql` — Supabase DB schema
- `docs/phase-4-training.md` — Training module plan; `docs/design/training/` — approved Training mockups (build UI to match them; README maps screens to chunks)
- `docs/phase-5-progress.md`: Progress tab plan (builds on Training C1, C2, C4 for tombstones, units and the weight log); `docs/design/progress/`: approved Progress mockups (build UI to match them; README maps screens to chunks)

## Data Model

```typescript
Food = { id, name, brand, serving_units, calories, protein, carbs, fat, source, updated_at }
MealId = string  // MealSlot is an alias; food_logs.meal_slot holds a meal id
MealDefinition = { id, position, calorie_target, protein_target, carb_target, fat_target (number|null), reminder_time ('HH:mm'|null), created_at, updated_at, synced_at? }
MealNameEntry = { meal_id, name, effective_from (yyyy-MM-dd), updated_at, synced_at? }  // name history; renames apply from today
FoodLog = { id, date, meal_slot, food_id, serving_amount, serving_unit, created_at, updated_at, synced_at?, deleted_at? }
MealSlotConfirmation = { id, date, meal_slot, confirmed, updated_at }
WeightEntry = { id, date, weight_kg, measured_at, created_at, updated_at, synced_at?, deleted_at? }  // kg; latest per day wins
UserGoals = { calorie_goal, protein_goal, carb_goal, fat_goal, updated_at }
UserProfile = { weight, height, activity_level, updated_at }
WaterLog = { id, date, amount, drink_name, created_at }
QuickAddDrink = { id, name, amount, food_id? }
```

## Development Tips

- **Recurring bug, `fullScreenModal` safe area:** `SafeAreaView` can report zero insets the first time a native `fullScreenModal` opens on iOS (it fixes itself after a reload), so the header sits under the status bar and Dynamic Island and its buttons can't be tapped. Hit in `barcode-scanner.tsx` and `workout/session.tsx`. In any `fullScreenModal` screen, use `useSafeAreaInsets()` and pad the root `View` instead of `SafeAreaView`
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

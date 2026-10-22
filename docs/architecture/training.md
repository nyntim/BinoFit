# Training (native only)

Plan: `docs/phase-4-training.md`. Approved mockups: `docs/design/training/` (build UI to match them; its README maps screens to chunks). Components live in `components/workouts/`.

## Schema and data API

`lib/workouts/schema.ts` (`initWorkoutSchema`, called from `initSchema`) creates `app_meta`, `exercises`, `workouts`, `workout_exercises`, `workout_sets`, `routines` and `routine_exercises`.

- Units: kg, metres, seconds. Sets have `rpe` and whole-number `rir` (0 to 10). Columns added later (`rir`, `playlist_name` / `playlist_id`) are added to existing installs by PRAGMA checks in `initWorkoutSchema` and to Supabase by bounded blocks in `supabase/schema.sql` (`workout_sets_rir`, `workouts_playlist_columns`).
- Every table has `created_at`, `updated_at`, `synced_at`, `deleted_at`. One `active` workout is enforced by a partial unique index.
- `lib/workouts/db.ts` is the data API: create/update/delete workouts, exercises and sets; `getWorkoutWithExercises` shows "Unknown exercise" for a missing definition; `ActiveWorkoutExistsError`; row builders and position helpers (`insertWorkoutExercise`, `insertWorkoutSet`, `buildWorkoutExerciseRow`, `buildWorkoutSetRow`, `nextExercisePosition`, `nextSetPosition`, `updateWorkoutExercise`).
- Active and draft sessions never sync and are hard-deleted. Done workouts and their children are tombstoned.

## Sync, restore and wipe

- `syncWorkoutTree` in `lib/sync.ts` snapshots the four unsynced sets, pushes exercises, workouts, workout_exercises and sets, marks them synced via `markRowsSynced` and purges tombstones (exercise tombstones that past workouts still reference are kept). `syncRoutines` does the same for routines.
- Restore: `lib/workouts/restore-apply.ts` applies custom exercises first, then the tree in one transaction (forced `done`, `decideRemoteApply`), then routines (`applyRemoteRoutines`).
- `clearUserData` removes workouts, routines and custom exercises but keeps seeds. `markAllUnsynced` resets routines too.
- Call `syncToSupabase()` after every exercise, finished-workout or routine write.

## Exercise library and builder

Seeds: `lib/workouts/exercise-seed.ts` holds the built-in exercises (slug ids, `source = 'seed'`). `lib/workouts/machine-seed.ts` adds branded machines: `MACHINE_TEMPLATES` crossed with `BRAND_LINEUPS` over `COMMON_MACHINE_BRANDS`, ids `<brand-slug>-<template-key>`, descriptive names only. `ALL_SEED_EXERCISES` (base plus machines, with `brand` and `load_type`) is what `seedExercises(db)` writes; `SEED_EXERCISES` stays the base list used by builder name suggestions.

- `seedExercises` runs from `initWorkoutSchema` only when `app_meta.exercise_seed_version` is below `EXERCISE_SEED_VERSION`. Bump it when the list changes. Seeds are never synced or wiped, dropped ids get `hidden = 1`, custom rows are untouched. Seed ids are never renamed (rename only `name`; dropping a row hides it).
- Muscle ids keep their stored names but `upper_back` shows as Traps, `lower_back` as Erectors and `abs` as Abdominals. Abductors count under Glutes. `REGIONS` is All, Chest, Shoulders, Triceps, Biceps, Forearms, Lats, Traps, Erectors, Abdominals, Glutes, Quads, Hamstrings, Adductors, Calves, Cardio.
- `lib/workouts/exercise-catalog.ts` (pure): labels, `MUSCLE_REGION`, `REGIONS`, `exerciseDisplayName` ("Name · Brand"), `exerciseSubtitle`, `splitSections`, and `filterExercises`. Search ranks exact > prefix > word prefix > substring and excludes hidden/deleted rows. It takes `aliases` (`SEED_ALIASES`, id to search terms, not stored) and `brand`: every token must match name, brand or alias, tokens inside the brand do not affect ranking (brand-only matches rank last), and `brand` filters case-insensitively.
- `lib/workouts/exercise-builder.ts` (pure): draft state keyed by step id (`builderSteps`, `isStepValid`, `primaryLabel` Next/Skip/Save, `brandChips`, `applyEquipment`, `toggleMuscle`, `nameSuggestions`, `reviewRows`, `draftToExerciseInput`). The sled weight is typed in the display unit and stored in kg.
- CRUD in `lib/workouts/exercises.ts`: `getExercises`, `getExerciseById` (includes tombstones), `createCustomExercise`, `updateCustomExercise`, `deleteCustomExercise` (tombstones), `getCustomExerciseBrands`.
- Screens: `workout/exercises` (library with region chips and an "All brands" chip row; `pick=1&workoutId=` makes it a modal picker that calls `addExerciseToWorkout`) and `workout/new-exercise` (guided builder modal; params `name`, `workoutId`, `id` for edit, which opens at review). After saving from pick mode, Done calls `router.dismiss(2)` (builder + picker).
- Builder details: the Per side / unilateral switch is on the name step (rep log types only); picking a similar built-in exercise also fills the name; the brand step shows used and common brand chips. The builder pads a root `View` with `useSafeAreaInsets()` and lifts its footer with `hooks/useKeyboardOverlap` on iOS. Discard confirmations use native `Alert` and `usePreventRemove`.

## Workout editor and log afterward

One editor serves Log past workout (`mode 'manual'`, a draft), finished workouts (`'edit'`) and the live session (`'live'`).

- `hooks/useWorkoutEditor(id, mode)` holds the `WorkoutWithExercises` in state (pure `editorReducer` in `lib/workouts/editor-state.ts`) and writes every action through a serial `createWriteQueue` (`lib/workouts/write-queue.ts`). Sets get client ids via the optional `id` in `addWorkoutSet` / `addWorkoutExercise`, so add-then-edit keeps order; a failed write reloads from SQLite.
- `mode 'edit'` calls `syncToSupabase()` after writes. Leaving `workout/[id]` runs `cleanupEmptyEntries`.
- Numeric cells (`NumericCell`) commit 300 ms after typing stops and on blur. Times are digits filled from the right (`parseClockDigits`).
- UI: `components/workouts/WorkoutEditor.tsx` (`WorkoutEditorBody`: meta card, `ExerciseBlock` per exercise, `SetTableHeader`, `SetRow` with optional Done column, `SetTypeSheet`, `OptionsSheet`, `AddExercisesButton`). Columns, badges (W/D/F, numbered normal sets) and cell text/parsing come from `editor-state.ts` (`setColumns(opts { effort: 'rpe' | 'rir' | null, showDone })`, `setBadges`, `cellText`, `cellPatch`, `applySchedule`).
- Pure rules:
  - `prefill.ts`: `prefillSets`, `resolveRestSeconds` (last > exercise default > 90, 0 = off), `previousFor`, `formatPreviousSet`.
  - `volume.ts`: `setVolumeKg`, `workoutVolumeKg` (warmups excluded, per side x2, bodyweight counts added load, plate-loaded counts logged plates only, assisted/time/distance count 0).
  - `completion.ts`: `isSetFilled`, `planSave`, `tickPatch` (ticking an empty set copies Previous), `planFinish`.
- `lib/workouts/previous.ts`: `getPreviousPerformance` (latest earlier done workout with the exercise, set by index); `addExerciseToWorkout` adds the link with resolved rest and prefilled unticked sets (at least the default set count, keeping previous sets and adding empty ones as needed) in one transaction.
- `lib/workouts/drafts.ts`: `getOrCreateDraft` reopens the newest draft, else today / start now -1 h / 1:00; `saveDraft` returns 'saved' | 'empty'; `cancelDraft` hard-deletes; `purgeStaleDrafts` removes drafts with no activity for over 7 days on launch; `applyCompletionPlan`.
- `lib/workouts/active-workout-store.ts` (+ `hooks/useActiveWorkout`) is the pub/sub store of the active workout (`refreshActiveWorkout` on launch, `setActiveWorkout`).
- `components/time-picker-sheet` takes `mode` ('time' | 'date'), `maximumDate`, `title`.

## Personal records

`lib/workouts/records.ts` is pure: Epley capped at 12 reps; four metrics for `weight_reps` exercises (heaviest weight, estimated 1RM, best set volume, most reps). Records are derived, never stored: no records table. Exports include `estimatedOneRepMax`, `recordValues`, `computeRecords`, `recordsByExercise`, `newRecordsFor`, `bestNewRecords`, `formatRecordSummary`, `recordSetFromWorkoutSet`, `collectRecordHits`, `recentRecordHits`. `lib/workouts/record-history.ts` `getPriorRecordSets` reads prior sets (batched, done workouts only).

- The editor shows a secondary-color "PR" tag on a ticked set that beats prior records; the finished workout (`mode 'edit'`) lists the records hit.
- Recent records on Progress use `recentRecordHits` (see [progress.md](progress.md)).

## Training tab

`app/(tabs)/training.tsx`:

- Primary button "Start empty workout" / "Resume workout" (when `useActiveWorkout` has one) pushes `/workout/session`.
- `WeekSummaryCard` (Monday to Sunday by workout `date`: sessions, volume in the display unit, time), then `MuscleSetsCard` (hidden when empty, two columns via `pairRows`): this week's working sets per region via `setsPerMuscle` / `formatMuscleSetCount`. Each ticked non-warmup set of a done workout counts once per distinct primary region; secondary muscles get no credit; `full_body` is ignored.
- Routines card (see Routines).
- History card with the last 3 done workouts (`WorkoutHistoryRow` opens `/workout/[id]`, "All workouts" opens `/workout/history`, 30 per page grouped by month). Long press on a row here or in `workout/history` opens an options sheet (Save as routine, Open), also exposed as a VoiceOver action.
- Exercises and Log past workout rows.
- Pure `lib/workouts/summary.ts` (`weekRange`, `formatWeekRange`, `summarizeWorkout`, `summarizeWeek`, `formatDurationShort`, `formatVolume`, `workoutTitle`, `groupByMonth`, `setsPerMuscle`); reads in `lib/workouts/history.ts` (`getDoneWorkoutDates(today)`, `getDoneWorkoutsBetween`, `getRecentDoneWorkouts(limit, offset)`, batched, done only); hooks `useTrainingOverview`, `useWorkoutHistory` (reload on focus). Types `WorkoutSummary`, `WeekSummary` are in `lib/types.ts`.

## Live session and session bar

- `lib/workouts/session.ts`: `STALE_AFTER_MS` (6 h); `startEmptyWorkout(now)` creates the `active` workout (a double start returns the existing one); `lastActivityAt(w)` (latest ticked set, else start); `isStale(w, now)` (6 h or more since then); `finishWorkout(id, {endAt?, discardUnticked}, now)` returns 'finished' | 'needs-confirm' | 'empty' | 'gone' (missing or no longer active); `discardActiveWorkout(id)`. Both end by calling `setActiveWorkout(null)` and `stopRestTimer`.
- `planFinish(w, now, opts)` in `completion.ts` is the pure rule: ticked sets stay, unticked sets without data are dropped, unticked sets with data need confirmation (then dropped), exercises left empty are removed, no ticked set means 'empty', duration is `endAt` (default now, clamped to start..now) minus start, and the workout is dated by its start.
- `lib/workouts/finish-flow.ts` holds the native Alerts: `confirmAndFinish(id, endAt?)`, `confirmAndDiscard(id)` ("No completed sets", "Unfinished sets" / "Discard and finish", "Discard this workout?").
- `hooks/useStaleSessionPrompt` (mounted in `app/_layout.tsx`) asks "Still training?" (Finish at last set / Keep going / Discard) on launch and foreground. Any cancelled outcome snoozes 6 h in memory; skipped while `/workout/session` is open.
- `hooks/useNow(intervalMs, enabled)` is a ticking clock.
- `app/workout/session.tsx` (`fullScreenModal`) starts a workout itself when none is active, shows `WorkoutEditorBody` in mode 'live' (`showMeta={false}`, Discard as `footer`), minimizes with the chevron or Android back, and on Finish goes to `/workout/[id]`.
- `components/workouts/ActiveWorkoutBar.tsx` (`detail` for "Rest 1:24", `elapsedSeconds`) is shown by the tab navigator: as the native bottom accessory on iOS 26+, otherwise above `FloatingTabBar` (see [navigation.md](navigation.md)).

## Rest timer and notifications

- `lib/workouts/rest-timer.ts` (pure, `now` passed in): `startRest` (null when 0 = off), `remainingSeconds` (ceil), `adjustRest` (+/-15 s on the absolute `endsAt`; -15 with 15 s or less left returns null = ends), `restoreRest(stored, activeWorkoutId, now)` (kept only for the active workout and before `endsAt`), `restNotificationBody`, `restChoiceLabel`, `restSecondsForTick`. A rest of 0 reads "No rest" everywhere. `RestTimerState` also carries optional `workoutExerciseId`, `exerciseName` (kept by `parseRestTimer`) and `setId`.
- `lib/workouts/rest-notifications.ts` (mockable, serialised, never throws, no-op on web): `REST_TIMER_PREFIX` `rest-timer:`, Android channel `rest-timer`, `ensureRestPermission(prompt)` (asks at most once, only while undetermined; denied means the timer still runs in-app), `scheduleRestNotification` (DATE trigger, id `rest-timer:<workoutId>`, replaces the existing one; "Rest over" / "Next set: <exercise>.", sound), `cancelRestNotification`, `cancelAllRestNotifications`. `configureNotificationHandler` hides the foreground banner for `rest-timer:*`.
- `lib/workouts/rest-timer-store.ts` is the pub/sub store kept in step with AsyncStorage and the notification: `startRestTimer` (prompts for permission on first start), `adjustRestTimer`, `stopRestTimer(workoutId?)`, `stopRestTimerForSet`, `expireRestTimer`, `restoreRestTimer(activeWorkoutId)` (on launch, re-arms without prompting; stale or other-workout timers are cleared), `clearRestTimerAndNotifications` (called by `finishWipe`).
- The global Rest timer switch is applied when a rest starts (`startRestTimer` returns null and stops any running rest; `restoreRestTimer` clears a stored timer when off), never inside `resolveRestSeconds`. With it off the live editor hides the "Rest time" option and rest labels.
- The session starts a rest after every tick (warmups too; exercise rest, else 90 s, 0 = off) via `WorkoutEditorBody`'s `onToggled`, and cancels it only when the set that started it is unticked.
- UI: `hooks/useRestTimer` derives the countdown; `RestBanner` ("Rest · <exercise>", -15s, +15s, Skip) is pinned between the session header and the scrolling editor; `RestPickerSheet` is the "Rest time" exercise option; `ActiveWorkoutBar` appends "Rest 1:24".

## Routines

SQLite `routines` and `routine_exercises` (allow-listed in `lib/tombstones.ts`; sync, restore and wipe as above; `RestoreSummary.routinesRestored` counts for `hasRestoredData`).

- Pure `lib/workouts/routine-plan.ts`: `clampSetCount` (1..10), `routineDisplayName`, `routineSubtitle`, `setsForRoutineExercise` (previous sets win, else `set_count` empty sets), `planRoutineStart`, `routineFromWorkout`.
- `lib/workouts/routines.ts`: reads (`getRoutine`, `getRoutineWithExercises`, `getRoutines`), edits (`createRoutine`, `renameRoutine`, `reorderRoutines`, `addExerciseToRoutine`, `updateRoutineExerciseSetCount`, `updateRoutineExerciseRest`, `reorderRoutineExercises`, `removeRoutineExercise`, `deleteRoutine`) and actions (`saveWorkoutAsRoutine`, `startLiveFromRoutine`, `startDraftFromRoutine`).
- UI: Training tab Routines card (`hooks/useRoutines.ts`, `ReorderableList` reorder, "New routine"); `app/workout/routine.tsx` (`RoutineExerciseRow`, `RestPickerSheet`, `AddExercisesButton` with `routineId`, "Start workout" and "Log past workout" via `/workout/log?id=`); "Save as routine" in `app/workout/[id].tsx`. Every save-as-routine entry point uses `saveAsRoutineWithFeedback` in `lib/workouts/routine-flow.ts`.

## Related

- Spotify playlist on workouts and Apple Health workout export: [integrations.md](integrations.md).
- Training on the Progress tab: [progress.md](progress.md).
- Effort, rest timer and default set preferences: [preferences.md](preferences.md).

# Training (native only)

Decisions: ADRs 0005 to 0008 in `docs/decisions/`. Historical mockups: `docs/design/training/`. Components live in `components/workouts/`.

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
- Screens: `workout/exercises` (browse: back to Training, a tinted "New exercise" icon button, `largeTitle`, `SearchField`, region chips, brand chips with "All brands" in the ink tone, a "New exercise" promo card, then "Yours" and a section named after the selected region or "All exercises"; `pick=1&workoutId=` or `routineId=` makes it a modal picker with a `SheetHeader` ("Add exercises"), a focused search field and no promo card; one tap adds the exercise (`addExerciseToWorkout` / `addExerciseToRoutine`) and closes) and `workout/new-exercise` (guided builder modal; params `name`, `workoutId`, `id` for edit, which opens at review). After saving from pick mode, Done calls `router.dismiss(2)` (builder + picker).
- Builder details: the Per side / unilateral switch is on the name step (rep log types only); picking a similar built-in exercise also fills the name; the brand step shows used and common brand chips. The header is Cancel, a "Step n of N" caption ("Review" on the last step) and a 4 px progress bar (`StepCaption`, `StepBar`). Equipment is a two-column grid of `OptionCard layout="tile"` with glyphs (radio semantics). Muscles keep multi-select: "Main muscles" (at least one) and "Also works (optional)" in the soft chip tone. The review step is a summary card (name and muscles each tap back to their step) over a `ListGroup` of the other lines (`ReviewRow`), with Delete exercise in edit mode. The footer is Back (secondary) and the primary Next / Skip / Save. The builder pads a root `View` with `useSafeAreaInsets()` and lifts its footer with `hooks/useKeyboardOverlap` on iOS. Discard confirmations use native `Alert` and `usePreventRemove`.

## Workout editor and log afterward

One editor serves Log past workout (`mode 'manual'`, a draft), finished workouts (`'edit'`) and the live session (`'live'`).

- `hooks/useWorkoutEditor(id, mode)` holds the `WorkoutWithExercises` in state (pure `editorReducer` in `lib/workouts/editor-state.ts`) and writes every action through a serial `createWriteQueue` (`lib/workouts/write-queue.ts`). Sets get client ids via the optional `id` in `addWorkoutSet` / `addWorkoutExercise`, so add-then-edit keeps order; a failed write reloads from SQLite.
- `mode 'edit'` calls `syncToSupabase()` after writes. Leaving `workout/[id]` runs `cleanupEmptyEntries`.
- Numeric cells (`NumericCell`) commit 300 ms after typing stops and on blur. Times are digits filled from the right (`parseClockDigits`).
- UI: `components/workouts/WorkoutEditor.tsx` (`WorkoutEditorBody`: meta card, `ExerciseBlock` per exercise (a `Card` with a Cardio / Time tag for those log types), `SetTableHeader`, `SetRow` with optional Done column, `SetTypeSheet`, `OptionsSheet`, `AddExercisesButton`). In the live session `liveFocus` marks the first exercise with an unticked set as current and its first unticked set as the active row (tinted row, tint-bordered weight cell); later exercises with no ticked set render as a collapsed `ExerciseSummaryCard` ("0 of 3 sets · last 115 × 8", set dots) until tapped, and the footer puts "Add exercises" and Discard side by side. Tapping a set number opens `SetTypeSheet`: a radio list (Normal shows the set's number, Warm-up, Drop set, Failure, each with a one-line description), a "Rest after this exercise" row that opens `RestPickerSheet` (live mode with the rest timer on) and Delete set. Columns, badges (W/D/F, numbered normal sets) and cell text/parsing come from `editor-state.ts` (`setColumns(opts { effort: 'rpe' | 'rir' | null, showDone })`, `setBadges`, `cellText`, `cellPatch`, `applySchedule`).
- Pure rules:
  - `prefill.ts`: `prefillSets`, `resolveRestSeconds` (last > exercise default > 90, 0 = off), `previousFor`, `formatPreviousSet`.
  - `volume.ts`: `setVolumeKg`, `workoutVolumeKg` (warmups excluded, per side x2, bodyweight counts added load, plate-loaded counts logged plates only, assisted/time/distance count 0).
  - `completion.ts`: `isSetFilled`, `planSave`, `tickPatch` (ticking an empty set copies Previous), `planFinish`. Completing a rep-based set with effort enabled but blank sets RPE 10 or RIR 0, both live and on a past workout's Save; Finish and cleanup never backfill effort.
- `lib/workouts/previous.ts`: `getPreviousPerformance` (latest earlier done workout with the exercise, set by index); `addExerciseToWorkout` adds the link with resolved rest and prefilled unticked sets (at least the default set count, keeping previous sets and adding empty ones as needed) in one transaction.
- `lib/workouts/drafts.ts`: `getOrCreateDraft` reopens the newest draft, else today / start now -1 h / 1:00; `saveDraft` returns 'saved' | 'empty'; `cancelDraft` hard-deletes; `purgeStaleDrafts` removes drafts with no activity for over 7 days on launch; `applyCompletionPlan`.
- `lib/workouts/active-workout-store.ts` (+ `hooks/useActiveWorkout`) is the pub/sub store of the active workout (`refreshActiveWorkout` on launch, `setActiveWorkout`).
- `components/time-picker-sheet` takes `mode` ('time' | 'date'), `maximumDate`, `title`.

## Personal records

`lib/workouts/records.ts` is pure: Epley capped at 12 reps; four metrics for `weight_reps` exercises (heaviest weight, estimated 1RM, best set volume, most reps). Records are derived, never stored: no records table. Exports include `estimatedOneRepMax`, `recordValues`, `computeRecords`, `recordsByExercise`, `newRecordsFor`, `bestNewRecords`, `formatRecordSummary`, `recordSetFromWorkoutSet`, `collectRecordHits`, `recentRecordHits`. `lib/workouts/record-history.ts` `getPriorRecordSets` reads prior sets (batched, done workouts only).

- `workoutRecords(workout, priors)` returns, per weight_reps exercise, the values it beat (`beaten`) and the record kinds per set (`setKinds`); `hasBeaten`, `countRecordExercises` (exercises, not kinds), `formatRecordCount` and `formatSetRecordNote` (first kind: "Heaviest 75 kg", "Est. 1RM 128 lb", "Best set 1,200 kg", "Most reps 12") build on it. `getWorkoutRecordCounts(workouts)` in `record-history.ts` batches one prior read for a list of done workouts and returns the record count per workout id (workouts with none are left out).
- The editor shows an ember star beside the number of a ticked set that beats prior records; edit mode also lists the records hit ("PR · ...").
- Recent records on Progress use `recentRecordHits` (see [progress.md](progress.md)).

## Training tab

`app/(tabs)/training.tsx`:

- Title row with a Training settings button. Primary: with an active workout, a tint "In progress" card (name, elapsed and "3 of 10 sets", an inverted Resume pill; one button named "Resume workout. ..."), otherwise "Start empty workout"; both push `/workout/session`.
- `WeekSummaryCard` (Monday to Sunday by workout `date`: sessions, volume in the display unit, time, and a seven-day strip: done days tint, today dashed while a workout runs; `weekActivity`, `weekActivityLabel`), then `MuscleSetsCard` (hidden when empty, two columns via `pairRows`): this week's working sets per region via `setsPerMuscle` / `formatMuscleSetCount`. Each ticked non-warmup set of a done workout counts once per distinct primary region; secondary muscles get no credit; `full_body` is ignored.
- Routines card (see Routines), before History.
- History card with the last 3 done workouts (`WorkoutHistoryRow` with an ember "N records" tag from `recordCounts`, opens `/workout/[id]`; "All workouts" opens `/workout/history`: a `largeTitle`, 30 per page, one card per month with a "N workouts" count once the month is fully loaded, rows with a weekday and day block). Long press on a row here or in `workout/history` opens an options sheet (Save as routine, Open), also exposed as a VoiceOver action.
- A list group with Exercises and Log past workout.
- Pure `lib/workouts/summary.ts` (`weekRange`, `formatWeekRange`, `summarizeWorkout`, `summarizeWeek`, `formatDurationShort`, `formatVolume`, `workoutTitle`, `groupByMonth`, `setsPerMuscle`); reads in `lib/workouts/history.ts` (`getDoneWorkoutDates(today)`, `getDoneWorkoutsBetween`, `getRecentDoneWorkouts(limit, offset)`, batched, done only); hooks `useTrainingOverview` (also `doneDates`, `recordCounts`, `activeProgress`), `useWorkoutHistory` (also `recordCounts`; reload on focus). Record counts and progress never fail a load: on error the tags and the set count are left out. Types `WorkoutSummary`, `WeekSummary` are in `lib/types.ts`.

## Live session and session bar

- `lib/workouts/session.ts`: `STALE_AFTER_MS` (6 h); `startEmptyWorkout(now)` creates the `active` workout (a double start returns the existing one); `lastActivityAt(w)` (latest ticked set, else start); `isStale(w, now)` (6 h or more since then); `finishWorkout(id, {endAt?, discardUnticked}, now)` returns 'finished' | 'needs-confirm' | 'empty' | 'gone' (missing or no longer active); `discardActiveWorkout(id)`. Both end by calling `setActiveWorkout(null)` and `stopRestTimer`.
- `planFinish(w, now, opts)` in `completion.ts` is the pure rule: ticked sets stay, unticked sets without data are dropped, unticked sets with data need confirmation (then dropped), exercises left empty are removed, no ticked set means 'empty', duration is `endAt` (default now, clamped to start..now) minus start, and the workout is dated by its start.
- `lib/workouts/finish-flow.ts` holds the native Alerts: `confirmAndFinish(id, endAt?)`, `confirmAndDiscard(id)` ("No completed sets", "Unfinished sets" / "Discard and finish", "Discard this workout?").
- `hooks/useStaleSessionPrompt` (mounted in `app/_layout.tsx`) asks "Still training?" in a native `Alert` (`staleMessage`: "Push day has been open for 7 hours. Your last set was at 6:12 PM." or "No sets ticked yet."; Finish at last set / Keep going / Discard workout) on launch and foreground. Any cancelled outcome snoozes 6 h in memory; skipped while `/workout/session` is open.
- `hooks/useNow(intervalMs, enabled)` is a ticking clock.
- `app/workout/session.tsx` (`fullScreenModal`) starts a workout itself when none is active, shows a header (minimize, name, "42:10 · 3 of 10 sets", Finish) with the rest banner pinned under it, `WorkoutEditorBody` in mode 'live' (`showMeta={false}`, Discard as `footer`), minimizes with the chevron or Android back, and on Finish marks the workout with `markJustFinished` (`lib/workouts/finish-celebration.ts`, an in-memory one-shot flag) and goes to `/workout/[id]`.
- `app/workout/[id].tsx` opens a read view (`WorkoutSummaryView`: title, date / start / duration, Volume, Sets and Duration stats, each exercise's sets with an ember "Record" tag and per-set notes, Save as routine, Edit). Edit switches the screen to the editor (mode 'edit') with Done to return. Only when the flag is set (right after Finish from the session) a `CelebrationBanner` shows "Workout saved" and "N new records. Nice work." once the workout has loaded; leaving the screen clears the flag, so opening from history, the Training tab or Progress never celebrates.
- `components/workouts/ActiveWorkoutBar.tsx` (`detail` for "Rest 1:24", `elapsedSeconds`) is shown by the tab navigator: as the native bottom accessory on iOS 26+, otherwise above `FloatingTabBar` (see [navigation.md](navigation.md)).

## Rest timer and notifications

- `lib/workouts/rest-timer.ts` (pure, `now` passed in): `startRest` (null when 0 = off), `remainingSeconds` (ceil), `adjustRest` (+/-15 s on the absolute `endsAt`; -15 with 15 s or less left returns null = ends), `restoreRest(stored, activeWorkoutId, now)` (kept only for the active workout and before `endsAt`), `restNotificationBody`, `restChoiceLabel`, `restSecondsForTick`. A rest of 0 reads "No rest" everywhere. `RestTimerState` also carries optional `workoutExerciseId`, `exerciseName` (kept by `parseRestTimer`) and `setId`.
- `lib/workouts/rest-notifications.ts` (mockable, serialised, never throws, no-op on web): `REST_TIMER_PREFIX` `rest-timer:`, Android channel `rest-timer`, `ensureRestPermission(prompt)` (asks at most once, only while undetermined; denied means the timer still runs in-app), `scheduleRestNotification` (DATE trigger, id `rest-timer:<workoutId>`, replaces the existing one; "Rest over" / "Next set: <exercise>.", sound), `cancelRestNotification`, `cancelAllRestNotifications`. `configureNotificationHandler` hides the foreground banner for `rest-timer:*`.
- `lib/workouts/rest-timer-store.ts` is the pub/sub store kept in step with AsyncStorage and the notification: `startRestTimer` (prompts for permission on first start), `adjustRestTimer`, `stopRestTimer(workoutId?)`, `stopRestTimerForSet`, `expireRestTimer`, `restoreRestTimer(activeWorkoutId)` (on launch, re-arms without prompting; stale or other-workout timers are cleared), `clearRestTimerAndNotifications` (called by `finishWipe`).
- The global Rest timer switch is applied when a rest starts (`startRestTimer` returns null and stops any running rest; `restoreRestTimer` clears a stored timer when off), never inside `resolveRestSeconds`. With it off the live editor hides the "Rest time" option and rest labels.
- The session starts a rest after every tick (warmups too; exercise rest, else 90 s, 0 = off) via `WorkoutEditorBody`'s `onToggled`, and cancels it only when the set that started it is unticked.
- UI: `hooks/useRestTimer` derives the countdown; `RestBanner` (an ink surface: "Rest · <exercise>", the countdown, -15, +15, Skip) is pinned in the session header block; `RestPickerSheet` is the "Rest time" exercise option; `ActiveWorkoutBar` appends "Rest 1:24".

## Routines

SQLite `routines` and `routine_exercises` (allow-listed in `lib/tombstones.ts`; sync, restore and wipe as above; `RestoreSummary.routinesRestored` counts for `hasRestoredData`).

- Pure `lib/workouts/routine-plan.ts`: `clampSetCount` (1..10), `routineDisplayName`, `routineSubtitle`, `setsForRoutineExercise` (previous sets win, else `set_count` empty sets), `planRoutineStart`, `routineFromWorkout`.
- `lib/workouts/routines.ts`: reads (`getRoutine`, `getRoutineWithExercises`, `getRoutines`), edits (`createRoutine`, `renameRoutine`, `reorderRoutines`, `addExerciseToRoutine`, `updateRoutineExerciseSetCount`, `updateRoutineExerciseRest`, `reorderRoutineExercises`, `removeRoutineExercise`, `deleteRoutine`) and actions (`saveWorkoutAsRoutine`, `startLiveFromRoutine`, `startDraftFromRoutine`).
- UI: Training tab Routines card (`hooks/useRoutines.ts`, `ReorderableList` reorder, "New routine"); `app/workout/routine.tsx` (`WorkoutNavBar`, a large name field, `RoutineExerciseRow` with handle, set `Stepper`, rest button and remove, `RestPickerSheet`, `AddExercisesButton` with `routineId`, a footer with "Start workout" and "Log past workout" via `/workout/log?id=`); each routine row on the Training tab has a Start button. Both start paths use `startRoutineWithFeedback` in `routine-flow.ts` (the empty-routine, workout-already-active and failure Alerts, then the session); "Save as routine" in `app/workout/[id].tsx`. Every save-as-routine entry point uses `saveAsRoutineWithFeedback` in `lib/workouts/routine-flow.ts`.

## Related

- Spotify playlist on workouts and Apple Health workout export: [integrations.md](integrations.md).
- Training on the Progress tab: [progress.md](progress.md).
- Effort, rest timer and default set preferences: [preferences.md](preferences.md).

## Weekly volume targets

Optional targets are edited at `/settings/weekly-volume-targets`, reached from Training settings or the Sets card. `lib/workouts/targets.ts` validates whole targets from 1 through 40 and merges them with the unchanged working-set counts. Blank or zero clears a target. The card shows under, met and over states, clamps target bar fills to 100%, and retains exact counts. Targeted regions remain visible at zero sets, including after Monday rollover. Count-only rows keep relative bars. Rows sort by descending count then region order; the card hides only when the merged list is empty. `useTrainingOverview` reloads goals on focus with the existing request-generation protection. Recommended values fill only blank draft fields for six regions and require Save.

# Phase 4: Training

Plan for the Training module: Phase 1 foundations and Phase 2 workout core, with seams for later phases. Read alongside `CLAUDE.md`, `PRODUCT.md` and `DESIGN.md`.

**UI must match the approved mockups in `docs/design/training/`** (see its README for the screen-to-chunk map and how to read them). Every chunk with UI reads its mockups before planning, and design review checks against them.

## Product decisions

- One app. Training lives in one tab, renamed from Exercise to **Training**. Built as a self-contained module (`lib/workouts/`, `components/workouts/`, `app/workout/`) whose only future link to nutrition is a daily exercise-burn total.
- Strength and cardio. Cardio is manual entry: duration, optional distance, computed pace.
- Logging: live session and log-afterward, sharing one editor. Past workouts are editable (write-through, no Cancel).
- Live session: start empty (routines come in Phase 3), previous session's sets prefilled, tick to complete, rest timer auto-starts, full-screen layer that minimizes to a bar above the tab bar.
- Set types: normal, warmup, drop, failure. RPE behind a setting (off by default).
- Units: lb (default) or kg, stored as kg. **Distance follows the weight unit** (kg uses km, lb uses mi).
- Onboarding asks "Track nutrition, training, or both" and hides tabs to match. **Cleared on sign-out.**
- **The latest weight entry is canonical** and writes `profile.weight`; the Settings weight field shows it.
- **Rest default:** last rest used for that exercise, else the exercise default, else 90 s. No global setting.
- **Stale session:** prompt after 6 hours; Finish ends at the last ticked set.
- **Rest notification permission:** asked the first time a rest timer starts.
- **Volume:** `weight_reps` only, warmups excluded; `bodyweight_reps` counts added load only; per-side exercises count both sides.
- **Routines section** is hidden until Phase 3. Routines get a normal editor (no guided builder).
- **Default workout name:** blank, displayed as "Workout · Tue 14 Oct".
- Out of scope: programs, auto-progression, GPS, Apple Watch, social, measurements and photos, videos, gym/location tagging.

## Exercise library

A deliberately small built-in list of 46 unbranded movements, hand-curated (free-exercise-db used only as a reference for names and muscle mapping; none of its text or images are imported). Gym-specific exercises come from the exercise builder.

| Group | Exercises |
|---|---|
| Chest (7) | Barbell bench press, Incline barbell bench press, Dumbbell bench press, Incline dumbbell press, Dumbbell fly, Push-up, Dip |
| Back (7) | Deadlift, Pull-up, Chin-up, Lat pulldown, Barbell row, Dumbbell row*, Seated cable row |
| Shoulders (5) | Overhead press, Dumbbell shoulder press, Lateral raise, Rear delt fly, Face pull |
| Arms (6) | Barbell curl, Dumbbell curl, Hammer curl, Triceps pushdown, Overhead triceps extension, Skull crusher |
| Legs (10) | Back squat, Front squat, Romanian deadlift, Leg press, Bulgarian split squat*, Walking lunge*, Leg extension, Leg curl, Hip thrust, Standing calf raise |
| Core (3) | Plank (duration), Hanging leg raise, Cable crunch |
| Cardio (8) | Run, Walk, Cycle, Row, Elliptical, Stair climber, Swim, Jump rope |

`*` per side. Every seed row has a stable slug id, log type, primary/secondary muscles, equipment, default rest and a MET value (Compendium of Physical Activities, for Phase 4 burn). Seeds are never synced, wiped or deleted; retire with `hidden = 1`.

## Exercise builder

A guided flow, one question per screen with a progress line, Back and Next. It promotes creating your own exercises and returns the finished exercise on a review card.

1. **Equipment:** Machine, Cable, Barbell, Dumbbell, Bodyweight, Cardio machine, Other.
2. **Brand** (Machine, Cable, Cardio machine; optional): free text with suggestions from brands the user entered before.
3. **Loading** (Machine only): Weight stack, or Plate-loaded with an optional starting (sled) weight. Logged weight on plate-loaded machines is the plates added; the starting weight is shown for reference and not added to volume.
4. **Name:** free text; suggests matching built-in movements, and picking one prefills muscles and log type.
5. **Muscles:** one primary required, secondary optional, as body-region chips.
6. **How you log it:** weight x reps (default), bodyweight + reps, assisted, time, distance + time. A "Per side" switch for rep-based types (reps shown as "/side", volume counts both sides).
7. **Setup notes** (optional): e.g. "Seat 4, back pad 2". Shown under the exercise name in every session.
8. **Review card:** "Chest Press · Hammer Strength", equipment badge, muscles, log type, loading, setup notes. Each line taps back to its step. **Save**.

Entry points:
- Exercise picker in a session: saving adds the exercise to the workout.
- Library: "+ New exercise".
- Search with no results: "Create '<query>'" with the name prefilled.

Editing a custom exercise reopens the review card. Deleting tombstones it; past workouts still show its name.

## Data

### Tombstones (food logs and every new table)
- Delete sets `deleted_at = now`, `updated_at = now`, `synced_at = NULL`. Only active or draft workouts are hard-deleted (they never sync).
- Every user-facing read filters `deleted_at IS NULL`.
- Push includes `deleted_at`; after a successful push, `purgeSyncedTombstones(table)` removes synced tombstones.
- `markRowsSynced(table, [{id, updated_at}])` marks only rows unchanged since the push (fixes the existing race where an edit during a push is marked synced).
- Restore passes tombstones through: newer remote tombstone deletes the local row, no local row is skipped, otherwise last-write-wins.
- Food logs: add `deleted_at` column; `deleteFoodLog` and `saveMealDraft` stop calling Supabase delete directly; filter reads in `getFoodLogsByDate`, `getFoodLogsWithFoodByDate`, `getFoodLogsWithFoodInRange`, `getRecentFoods`, `getFrequentFoods`, `getLoggedDates*`, `getAllLoggedDates`, `countFoodLogsForMeal`, `replaceMealsFromRemote`.

### SQLite tables (`lib/workouts/schema.ts`, `initWorkoutSchema`)
Times ISO, dates `yyyy-MM-dd` local, units kg / metres / seconds. All tables carry `created_at, updated_at, synced_at, deleted_at` unless noted.

- `app_meta (key PK, value)`: local only; `exercise_seed_version`.
- `weight_entries`: `id, date, weight_kg, measured_at, source ('manual' | 'healthkit')`. Index `(date)`. Latest `measured_at` per day wins (a `manual` entry is never replaced by an Apple Health import; see `docs/phase-5-progress.md`).
- `exercises`: `id, name, log_type, primary_muscles (JSON), secondary_muscles (JSON), equipment, brand, load_type ('stack' | 'plate' | null), base_weight_kg, per_side (0/1), setup_notes, default_rest_seconds, met, source ('seed' | 'custom'), hidden`. Index `(name)`.
- `workouts`: `id, status ('active' | 'draft' | 'done'), source ('live' | 'manual'), name, date, started_at, ended_at, duration_seconds, notes, routine_id (Phase 3)`. Indexes `(date)`, `(status, started_at)`, partial unique on `status` where active and not deleted.
- `workout_exercises`: `id, workout_id, exercise_id, position, rest_seconds, notes`. Indexes `(workout_id, position)`, `(exercise_id)`. Phase 3 adds `superset_group`.
- `workout_sets`: `id, workout_id, workout_exercise_id, position, set_type, weight_kg, reps, duration_seconds, distance_m, rpe, completed_at`. Indexes `(workout_exercise_id, position)`, `(workout_id)`.

`log_type`: `weight_reps`, `bodyweight_reps`, `assisted`, `duration`, `distance_duration`.

### What syncs
- Workouts with `status = 'done'` and their children only. Active and draft sessions stay on the device.
- Custom exercises only (`source = 'custom'`).
- All weight entries.

### Supabase (`supabase/schema.sql`, STEP A)
Five tables mirroring SQLite plus `user_id text not null`, `timestamptz` times, `id text primary key`, no foreign keys (children may arrive first). Strict `own rows` RLS from the start. `_merge_user_rows` updates all five. Apply before builds that sync them ship.

### Types (`lib/types.ts`)
`TrackingMode`, `WeightUnit`, `ExerciseLogType`, `MuscleGroup`, `Equipment`, `LoadType`, `SetType`, `WorkoutStatus`, `WorkoutSource`; rows `WeightEntry`, `Exercise`, `Workout`, `WorkoutExercise`, `WorkoutSet`; joined `WorkoutExerciseWithSets`, `WorkoutWithExercises`, `WorkoutSummary`, `WeekSummary`, `RestTimerState`; matching `Remote*` types; `FoodLog.deleted_at`.

### Preferences (`lib/storage.ts`, device only)
`TRACKING_MODE` (unset resolves to `both`), `WEIGHT_UNIT` (lb), `SHOW_RPE` (false), `ACTIVE_REST_TIMER`. Exposed through `lib/app-preferences.ts` (pub/sub) and `hooks/usePreferences.ts`. Sign-out clears tracking mode and rest timer, keeps unit and RPE.

### Restore and wipe
- Restore fetches the five tables, applies custom exercises, then workouts and children in one transaction, then weight. Restored workouts are `done`. Onboarding completes when goals or any data came back. Unknown exercise ids show as "Unknown exercise".
- Wipe clears weight, workouts, children and custom exercises; keeps seeds; cancels the rest notification.

## Screens

| Route | Purpose | Presentation |
|---|---|---|
| `/(tabs)/training` | Training tab | tab |
| `/workout/session` | Live session | full-screen modal, minimizes to bar |
| `/workout/log?id=` | Log a past workout (draft) | modal |
| `/workout/[id]` | Finished workout: view, edit, delete | push |
| `/workout/history` | All workouts | push |
| `/workout/exercises?pick=1&workoutId=` | Library and picker | push, modal when picking |
| `/workout/new-exercise?name=&workoutId=` | Exercise builder | modal |
| `/onboarding/mode` | Nutrition, training, or both | onboarding stack |

**Training tab:** Start empty workout (Resume workout when active), This week line (Monday start: sessions, volume, time), recent history, All workouts, Exercises, Log past workout.

**Session bar:** `ActiveWorkoutBar` rendered above `BottomTabBar` via the `tabBar` prop; name, elapsed time, rest countdown.

**Editor:** meta fields (date, start, duration in manual/edit mode), exercise blocks with setup notes under the name, set table (type badge, Previous, inputs by log type, optional RPE, tick in live mode), Add set, Add exercises. Live footer: Finish, Discard; rest banner with -15s, +15s, Skip.

**Settings:** `TrainingSection` with Units, Show RPE, Track mode, and a "Set goals" prompt when switching to a nutrition mode without goals.

**Progress:** `WeightCard` and `WeightEntrySheet`; the chart, edit and Apple Health import are `docs/phase-5-progress.md` P2 and P3.

## Session and timer design
- SQLite is the source of truth; every action writes through, serialized per editor; numeric cells commit on blur with a 300 ms debounce.
- Launch reads the active workout; the bar appears on any tab.
- Rest timer stores an absolute `endsAt`; the UI derives remaining time, so backgrounding and kills don't drift it. A DATE-trigger notification `rest-timer:<workoutId>` is replaced on adjust and cancelled on skip, un-tick, finish and discard. Foreground banner suppressed for these notifications. Web is a no-op.
- Finish drops empty unticked sets, confirms discarding filled unticked ones, sets duration, dates the workout by its start.
- Log afterward creates a draft; Save marks it done and ticks sets with data; Cancel deletes it; drafts older than 7 days are purged on launch.
- Prefill copies the most recent done workout's sets for that exercise (unticked); otherwise one empty set.

## Build order

1. **C1 Tombstones and mark-synced fix** (food logs).
2. **C2 Preferences store and units** (`lib/units.ts`). Parallel with C1.
3. **C3 Tracking mode onboarding, tab hiding, Training tab rename.** After C2. Mockup: `OnboardingMode`.
4. **C4 Weight log.** After C1, C2. Parallel with C3.
5. **C5 Workout schema, sync, restore, Supabase (no UI).** After C1. Parallel with C3, C4.
6. **C6 Exercise library and exercise builder** (seed of 46, library screen, `/workout/new-exercise`). After C5; seed data can be written early. Mockups: `Library`, `Builder`, `BuilderReview`.
7. **C7 Editor and log-afterward.** After C2, C5, C6. Mockups: `LogPast`, `Session` (set rows).
8. **C8 Training tab content.** After C7. Mockup: `Main`.
9. **C9 Live session and session bar.** After C7. Parallel with C8. Mockups: `Session`, `SessionBar`.
10. **C10 Rest timer and notifications.** After C9. Mockup: `Session` (rest banner).
11. **C11 CLAUDE.md update**, folded into each chunk.

## Tests
- C1: every food-log read excludes tombstones; sync sends and purges; push error keeps tombstone; mark-synced race; restore tombstone rules; migration on old schema.
- C2: unit round trips without drift; input parsing; pace with zero distance; duration formatting.
- C3: unset mode resolves to both; tab visibility by mode; sign-out keeps unit and RPE; restore completes onboarding without goals.
- C4: bodyweight lookup by date with profile fallback; latest-per-day; profile weight only from the latest entry; sync, restore, wipe.
- C5: only done workouts and children sync; delete cascades tombstones; discard hard-deletes; one active session; restore order and unknown exercises.
- C6: seed ids unique, enums valid, 46 rows; reseed idempotent and leaves custom rows; `filterExercises` ranking and filters; builder validation (name and primary muscle required, brand and loading only for relevant equipment, per side only for rep types).
- C7/C8: volume rules (warmups, per side, bodyweight added load, plate-loaded excludes base weight); week boundaries; midnight sessions; prefill mapping.
- C9/C10: finish rules; resume after restart; stale threshold; rest math with fake clocks; notification reschedule and cancel; web no-op; editor write queue order.

## Risks
- A food-log read that misses the tombstone filter resurrects deleted food (covered by C1 tests).
- Android may deliver the rest notification late under Doze or without exact-alarm permission; the in-app timer stays correct.
- Custom `tabBar` layout across iOS, Android and web (safe area, keyboard).
- Hiding Home: `app/index.tsx` and onboarding must route through `homeRouteFor(mode)`.
- Supabase tables must exist before C4/C5 builds sync; until then sync shows "Sync paused" without data loss.
- No pull sync between devices, only restore (unchanged).

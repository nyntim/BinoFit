# Training guide

Canvas page: **Training** (rows "Workouts" and "Exercises"). Board sources: `boards/Trn*.dc.html`. Read [foundations.md](foundations.md) first. Behavior reference: `docs/architecture/training.md`, ADRs [0005](../../decisions/0005-training-in-one-app.md) to [0008](../../decisions/0008-training-volume-rules.md).

Rules that do not change: SQLite write-through per editor, rest timer from absolute `endsAt`, volume rules in `lib/workouts/`, records derived in `lib/workouts/records.ts`, sync only done workouts.

Build order: Live session (with set type sheet), Training tab, Finished workout, History, Routine, Log past, Library, Picker, Builder (three boards), Stale prompt.

## TrnTab: Training tab (workout running)

- **Route:** `app/(tabs)/training.tsx` (`useTrainingOverview`, `useActiveWorkout`, `useRoutines`, `WeekSummaryCard`, `MuscleSetsCard`, `WorkoutHistoryRow`, `OptionsSheet`, `ReorderableList`).
- **Layout, top to bottom:**
  1. `largeTitle` "Training" with settings icon button (to `/settings/training`).
  2. Primary card: when a workout is active, a full `tint` card "In progress / name / elapsed · sets done" with a Resume button (inverted). With no active workout this becomes the "Start empty workout" primary large button.
  3. This week card (`WeekSummaryCard`): title with date range; three stats (sessions, volume in the display unit, time); a 7-day activity strip (done days `tint`, today `tintSoft` with dashed border when a workout is running, others `cardSecondary`).
  4. Sets this week (`MuscleSetsCard`): two-column grid of regions, each "value/target" with a check when met and a thin bar; Targets link (to `/settings/weekly-volume-targets`). Over target stays `tint`, full bar; no warning color. Keep hiding when empty.
  5. Routines card: rows with name and exercise summary plus Start (`soft` small); New routine link. Keep reorder and long-press options.
  6. History card: last 3 workouts (name, date and exercises, duration and volume, `ember` tag "N records" when any); All workouts link.
  7. List group: Exercises, Log past workout.
  8. Tab bar with the live workout accessory (native accessory on iOS 26+; `ActiveWorkoutBar` above `FloatingTabBar` elsewhere).
- **New:** the 7-day activity strip and the history record tags (records via `newRecordsFor` / `recordsByExercise`; cheap to compute for 3 rows). README D5.

## TrnSession: Live session

- **Route:** `app/workout/session.tsx` (`fullScreenModal`, safe-area insets). `WorkoutEditor` in mode `live`, `RestBanner`, `NowPlayingLine`, `useRestTimer`, `useNow`.
- **Layout:** pinned header: minimize (chevron down, 44 pt circle), name and "elapsed · N of M sets", Finish (primary). Rest banner pinned below (inverted `ink` surface, "Rest · exercise", `hero`-style countdown, −15, +15 translucent buttons, Skip solid); exercise cards: name, setup notes caption, options (ellipsis, opens `OptionsSheet`); set table columns Set / Previous / lb / Reps / effort (RIR or RPE per preference, hidden when None) / Done; rows 48 high; set label taps open `SetTypeSheet`; warmup label in `icon` color; record star (`ember`) next to a set that set a record; active row `tintSoft` with tint-bordered weight cell; done tick is a 30 px circle filled `tint`; "+ Add set". Collapsed upcoming exercises show "0 of 3 sets · last 115 × 8" and set dots. Footer: Add exercises (secondary) and Discard (`danger` text).
- **Keep:** `NowPlayingLine` (Spotify) under the header when connected (not drawn on the board), keyboard handling, finish flow alerts.
- **New:** the inline record star during a live session (records computed against history before this workout; README D5).

## TrnSetType: Set type sheet

- **Component:** `components/workouts/SetTypeSheet.tsx` (and options from `OptionsSheet`).
- **Layout:** sheet; "Set 3" and "exercise · weight × reps"; radio list Normal (badge shows the set number), Warmup W "Not counted in volume or records", Drop set D, Failure F; selected row `tintSoft` with tint badge and check; second panel: Rest after this exercise (opens `RestPickerSheet`), Delete set (`danger`).

## TrnStale: Still training?

- **Hook:** `hooks/useStaleSessionPrompt.ts` (native `Alert` today).
- **Layout:** centered dialog card over a dimmed screen: icon tile, "Still training?", "Push day has been open for 7 hours. Your last set was at 6:12 PM.", Finish at last set (primary), Keep going (secondary), Discard workout (`danger`).
- **Optional:** replacing the native Alert with this custom dialog is a choice (README D6). If kept native, only update the message copy to include the last-set time.

## TrnWorkout: Finished workout

- **Route:** `app/workout/[id].tsx` (`WorkoutEditor`, `useWorkoutEditor`, `OptionsSheet` for Save as routine and Delete).
- **Layout:** back to Training, more options; when arriving from Finish, an `emberSoft` `CelebrationBanner`: check with rays, "Workout saved", "2 new records. Nice work." (copy without records: "Workout saved."); `largeTitle` name and "date · start · duration"; three stat cards (Volume, Sets with warmup count, a third stat); exercise cards listing sets ("165 lb × 8") with an `ember` "Record" tag on the exercise and a record note on the set; Save as routine (secondary) and Edit (soft).
- **New:** celebration banner (show only right after Finish, via a route param) and the per-set record notes. The board's "Burned" stat has no per-workout data today; use Duration or Exercises count unless burn is built (README D3).
- **Accessibility:** announce the banner once; no looping animation; Reduce Motion shows it static.

## TrnHistory: All workouts

- **Route:** `app/workout/history.tsx` (`useWorkoutHistory`, 30 per page, grouped by month).
- **Layout:** back to Training; `largeTitle` "All workouts"; per month: section label with month and count, list group of rows: date block (weekday caption over day number in rounded type), name with optional record tag, exercises line, duration and volume right. Cardio rows show distance and pace instead of volume.
- **States:** keep "No workouts yet. Start one from the Training tab or log a past workout." as an `EmptyState`; load-more error row "Couldn't load more. Retry".

## TrnRoutine: Routine

- **Route:** `app/workout/routine.tsx` (`RoutineExerciseRow`, `RestPickerSheet`, `AddExercisesButton`, `BuilderInput`).
- **Layout:** back, "Routine" title, more options (Delete routine); Name field (big rounded text); "Exercises" section with estimated time; list rows with drag handle, name, sets summary, rest button (soft small with clock, opens `RestPickerSheet`; "No rest" allowed); dashed "+ Add exercises"; sticky footer: Start workout (primary lg) and Log past workout (ghost).
- **Note:** "About 60 min" estimate is **New** and optional.

## TrnLogPast: Log past workout

- **Route:** `app/workout/log.tsx` (`WorkoutEditor` in manual mode, `WorkoutMetaCard`).
- **Layout:** modal Cancel / "Log past workout" / Save; meta card rows: Name (inline field), Date, Start, Duration (soft buttons opening pickers); exercise cards by log type. Cardio card: Time, Distance (unit suffix), computed Pace in rounded type. Duration exercise card (Plank): Previous and a duration field. "+ Add set" and dashed "+ Add exercises".

## TrnLibrary: Exercise library

- **Route:** `app/workout/exercises.tsx` (`useExercises`, `ChipToggle`, `ExerciseRow`, `lib/workouts/exercise-catalog.ts`).
- **Layout:** back to Training, "+" tinted icon button (new exercise); `largeTitle` "Exercises"; search field; region chips (single select, horizontally scrollable); brand chips (small; "All brands" selected uses `ink` fill); `tintSoft` promo card "New exercise / Add the machine, its brand and your seat settings"; sections "Yours" (custom, with setup notes and equipment tag) and region groups (name, muscles caption, equipment tag).
- **Keep:** ranking, aliases, no-results "Create" state (see TrnPicker).

## TrnPicker: Add exercises

- **Route:** same screen with `pick=1&workoutId=` (modal).
- **Layout:** modal Cancel / "Add exercises"; focused search field; checkbox rows with name, muscles and last performance, equipment tag; card "Create 'query'" (to `/workout/new-exercise?name=`); floating primary "Add 2 exercises".
- **New:** multi-select. Today picking one exercise calls `addExerciseToWorkout` and returns. Multi-select needs a selection state and adding in order (README D7). Single-tap add remains acceptable if not approved; then drop the checkboxes and the floating button.

## TrnBuildEquip / TrnBuildMuscles / TrnBuildReview: Exercise builder

- **Route:** `app/workout/new-exercise.tsx` (`lib/workouts/exercise-builder.ts`, `StepProgress`, `OptionCard`, `ChipToggle`, `ReviewRow`, `BuilderInput`). Modal, safe-area insets, keyboard overlap handling stays.
- **Equipment step:** Cancel, "Step 1 of 7" caption, thin progress bar; heading "What equipment is it?" and helper; 2-column grid of option cards (icon, label), selected `tintSoft` with tint border; Next.
- **Muscles step:** heading "Which muscles does it work?", helper with the exercise name; "Main muscle" single-select chips (selected `tint` fill); "Also works (optional)" multi-select chips (selected `tintSoft` with tint border); Back (secondary) and Next.
- **Review step:** summary card (equipment icon tile, name in `heading`, brand, equipment tag, muscle chips); list of rows (Equipment, Brand, Loading, Log as, Setup) each tapping back to its step; caption; Save exercise.
- **Keep:** step rules (which steps show per equipment), validation, Next / Skip / Save labels from `primaryLabel`, regions from `REGIONS` (display names Traps, Erectors, Abdominals).

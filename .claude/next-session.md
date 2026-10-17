# Notes for the next session

Review notes from the app walkthrough. Handle these, then commit the deletion of this file.

## 1. More tab: remove the Track setting (high)
- Remove "Track" (Nutrition / Training / Both) from Settings > Training.
- Users permanently have both training and nutrition. Tracking mode is always `both`.
- Follow through: onboarding mode screen (`app/onboarding/mode.tsx`), `lib/tracking-mode.ts` (`isTabVisible`, `homeRouteFor`), the `trackingMode` preference and storage, goals validation skip, "Set goals" card, restore routing (`routeAfterAuth` / `hasRestoredData`), and the CLAUDE.md Tracking mode section.

## 2. Redo the exercise dataset (medium)
- Rebuild the built-in exercise list (`lib/workouts/exercise-seed.ts`) with the owner's personal adjustments.
- OPEN: the exact adjustments are not written down yet. Ask the owner for the list (names, equipment, muscles, rest defaults, what to drop or add) before changing it.
- Remember to bump `EXERCISE_SEED_VERSION`; dropped ids get `hidden = 1`.

## 3. Default number of sets (high)
- When a user adds a new exercise to a workout or a routine, automatically add the default number of sets.
- Default is 2, adjustable in Settings (training section). Device-only preference like the other training prefs.
- Touches `addExerciseToWorkout` (prefill logic in `lib/workouts/previous.ts`), the routine add path once routines exist, `lib/app-preferences.ts`, `lib/storage.ts`, `components/settings/TrainingSection.tsx`.
- OPEN: when previous performance exists, should the previous set count win over the default? Suggested: use whichever is larger, or keep previous count. Confirm.

## 4. Split the More tab into sections (medium)
- Separate the More tab into sections: general/account, Nutrition, Training (dedicated settings for each).
- Consider renaming the Home tab to "Nutrition" or "Eating". Needs a decision on the name, plus tab label, icon and route copy.
- Since Track is going away (item 1), both tabs always show, so the tab naming should make the Nutrition / Training pair clear.

## 5. Sync with Apple Health button (medium)
- Add a "Sync with Apple Health" button that migrates info between Apple Health and the app.
- Existing: `hooks/use-health-kit` (iOS only) reads steps and active calories and writes nutrition.
- OPEN: which data and which direction. Candidates: weight entries (both ways), workouts (write finished workouts, read workouts from other apps), nutrition (already writes), steps and active calories (read). Needs a plan covering duplicates, tombstones, and units (kg).

## 6. Ideate more features for Progress and Training (low, brainstorm first)
- Come up with ideas to add more info and features to the Progress tab and the Training tab.
- Deliverable is a ranked idea list for the owner to pick from, not code. Builds on `docs/phase-5-progress.md` and `docs/phase-4-training.md`.
- Starting points: PR tracking per exercise, volume per muscle group over time, estimated 1RM trend, training streak and consistency calendar, body measurements, weekly nutrition vs weight trend, routine templates and progression suggestions, rest/set time stats.

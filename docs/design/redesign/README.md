# Redesign: implementation directory

The single entry point for building the "lifted paper, precise ink, a little ember" redesign ([ADR 0017](../../decisions/0017-lifted-paper-direction.md)). Every screen in the app has a board on the design canvas; this page maps each board to its route and to the section of the guide that says how to build it.

## Read in this order

1. `PRODUCT.md` and `DESIGN.md` (principles and invariants; they still win over any board).
2. [foundations.md](foundations.md): tokens, type, elevation, primitives, shared patterns, accessibility, build order, verification. **Do this first; every screen depends on it.**
3. The area guide for the screens you are building: [onboarding](onboarding.md), [nutrition](nutrition.md), [training](training.md), [progress](progress.md), [settings](settings.md).
4. The board itself, on the canvas or in `boards/`.

## Where the designs live

- **Canvas (live, interactive):** https://claude.ai/artifact/3Qz6CX7Ct9budLf5dzHQSG. Pages: Direction, Onboarding, Nutrition, Training, Progress, Settings, Components. Each board has Dark and Accent settings, and boards link to each other in Play mode. Open it with the Artifact tool (`action: "read"`) or in a browser signed in to the owner's account.
- **Repo copy:** `docs/design/redesign/boards/<Board>.dc.html` plus the shared theme `boards/bf.css`. These are the board sources: HTML with inline layout and class names from `bf.css`. Read them for exact spacing, copy and structure. They do not render standalone (`support.js` and `/_blob/...` images only resolve on the canvas); the dinosaur image is `assets/images/icon.png`.
- **Never port HTML or CSS.** Rebuild in React Native with the primitives from foundations and theme tokens through `useThemeColor`.

## How to treat a board

- Layout, hierarchy, copy, spacing and states on the board are the target.
- Shipped behavior in `docs/architecture/` wins over a board. Where a board shows something the app does not do, the guide marks it **New**; build it only after the owner confirms the matching decision below.
- Sample data (names, numbers, dates) is illustrative.
- Board dates assume Friday 23 October 2026.

## Directory

Status: **Restyle** = same behavior, new look. **Restyle + new** = also has a **New** item (see guide). **Optional** = owner's call.

### Foundations

| Board | Canvas page | What it is | Build directions | Status |
|---|---|---|---|---|
| `bf.css` | (file) | Shared theme: tokens, primitives, patterns | [foundations.md](foundations.md) | Built (`constants/theme.ts`, `components/ui/`) |
| Foundations (`Main`) | Direction | Palette, type, components and states overview | [foundations.md](foundations.md) sections 1 to 5 | Built |
| Largest text (`LargeText`) | Direction | Dynamic Type and Reduce Transparency reference | [foundations.md](foundations.md) sections 3 and 8 | Reference (checked per screen) |
| Tab bar (`CmpTabBar`) | Components | Fallback tab shell and live workout accessory | [foundations.md](foundations.md) section 7 | Built |

### Onboarding

| Board | Canvas page | Route | Build directions | Status |
|---|---|---|---|---|
| `OnbWelcome` | Onboarding | `app/onboarding/index.tsx` | [onboarding.md#onbwelcome-welcome](onboarding.md#onbwelcome-welcome) | Built |
| `OnbAccount` | Onboarding | `app/onboarding/account.tsx`, `components/auth/AuthForm.tsx` | [onboarding.md#onbaccount-create-account](onboarding.md#onbaccount-create-account) | Built |
| `OnbRestore` | Onboarding | `app/onboarding/index.tsx` restore branch (or new `restore.tsx`) | [onboarding.md#onbrestore-restore-your-data](onboarding.md#onbrestore-restore-your-data) | Built (D2 default; Start fresh pending) |
| `OnbStats` | Onboarding | `app/onboarding/goals.tsx` step 1 | [onboarding.md#onbstats-about-you](onboarding.md#onbstats-about-you) | Built |
| `OnbTargets` | Onboarding | `app/onboarding/goals.tsx` step 2 | [onboarding.md#onbtargets-daily-targets](onboarding.md#onbtargets-daily-targets) | Built (D1 default) |
| `OnbComplete` | Onboarding | `app/onboarding/complete.tsx` | [onboarding.md#onbcomplete-all-set](onboarding.md#onbcomplete-all-set) | Built (first-action cards pending owner, New) |

### Nutrition

| Board | Canvas page | Route or component | Build directions | Status |
|---|---|---|---|---|
| `NutDashboard` | Nutrition / Today | `app/(tabs)/index.tsx` | [nutrition.md#nutdashboard-nutrition-dashboard-full-scroll](nutrition.md#nutdashboard-nutrition-dashboard-full-scroll) | Built (no Burned, D3; water total only, D4, flag off) |
| `NutEdit` | Nutrition / Today | Dashboard edit mode (`useMealDraft`, `EditModeBar`) | [nutrition.md#nutedit-edit-meals](nutrition.md#nutedit-edit-meals) | Built (Done stays in the top bar) |
| `NutMealSheet` | Nutrition / Today | `components/dashboard/MealSettingsSheet.tsx` | [nutrition.md#nutmealsheet-meal-targets-and-reminder](nutrition.md#nutmealsheet-meal-targets-and-reminder) | Built |
| `NutMealSummary` | Nutrition / Today | `components/dashboard/MealNutritionSummary.tsx` | [nutrition.md#nutmealsummary-meal-nutrition-summary](nutrition.md#nutmealsummary-meal-nutrition-summary) | Built |
| `NutCalendar` | Nutrition / Today | `components/CalendarWidget.tsx` month view | [nutrition.md#nutcalendar-month-calendar](nutrition.md#nutcalendar-month-calendar) | Built (D5) |
| `NutWater` | Nutrition / Today | `components/dashboard/WaterModals.tsx` | [nutrition.md#nutwater-add-a-drink](nutrition.md#nutwater-add-a-drink) | Built (D4; flag off) |
| `NutDayDetail` | Nutrition / Today | `app/day-detail.tsx` | [nutrition.md#nutdaydetail-past-day](nutrition.md#nutdaydetail-past-day) | Built (D5) |
| `NutSearch` | Nutrition / Logging food | `app/food-search.tsx` | [nutrition.md#nutsearch-food-search](nutrition.md#nutsearch-food-search) | Built (no quick-add or Recent tag) |
| `NutSearchMulti` | Nutrition / Logging food | `app/food-search.tsx` selection mode | [nutrition.md#nutsearchmulti-select-multiple](nutrition.md#nutsearchmulti-select-multiple) | Built |
| `NutSearchEmpty` | Nutrition / Logging food | `app/food-search.tsx` empty state | [nutrition.md#nutsearchempty-no-results](nutrition.md#nutsearchempty-no-results) | Built |
| `NutServing` | Nutrition / Logging food | `app/serving-picker.tsx` | [nutrition.md#nutserving-serving-picker](nutrition.md#nutserving-serving-picker) | Built (status is read-only) |
| `NutBatch` | Nutrition / Logging food | `app/food-batch-review.tsx` | [nutrition.md#nutbatch-review-selected-foods](nutrition.md#nutbatch-review-selected-foods) | Built |
| `NutScanner` | Nutrition / Logging food | `app/barcode-scanner.tsx` | [nutrition.md#nutscanner-barcode-scanner](nutrition.md#nutscanner-barcode-scanner) | Built |
| `NutScanMiss` | Nutrition / Logging food | `app/barcode-scanner.tsx` not-found state | [nutrition.md#nutscanmiss-barcode-not-found](nutrition.md#nutscanmiss-barcode-not-found) | Built |
| `NutCustomFood` | Nutrition / Logging food | `app/custom-food.tsx` | [nutrition.md#nutcustomfood-custom-food](nutrition.md#nutcustomfood-custom-food) | Built |

### Training

| Board | Canvas page | Route or component | Build directions | Status |
|---|---|---|---|---|
| `TrnTab` | Training / Workouts | `app/(tabs)/training.tsx` | [training.md#trntab-training-tab-workout-running](training.md#trntab-training-tab-workout-running) | Built |
| `TrnSession` | Training / Workouts | `app/workout/session.tsx`, `WorkoutEditor`, `RestBanner` | [training.md#trnsession-live-session](training.md#trnsession-live-session) | Built |
| `TrnSetType` | Training / Workouts | `components/workouts/SetTypeSheet.tsx` | [training.md#trnsettype-set-type-sheet](training.md#trnsettype-set-type-sheet) | Built |
| `TrnStale` | Training / Workouts | `hooks/useStaleSessionPrompt.ts` | [training.md#trnstale-still-training](training.md#trnstale-still-training) | Built (native Alert, D6) |
| `TrnWorkout` | Training / Workouts | `app/workout/[id].tsx` | [training.md#trnworkout-finished-workout](training.md#trnworkout-finished-workout) | Built |
| `TrnHistory` | Training / Workouts | `app/workout/history.tsx` | [training.md#trnhistory-all-workouts](training.md#trnhistory-all-workouts) | Built |
| `TrnRoutine` | Training / Workouts | `app/workout/routine.tsx` | [training.md#trnroutine-routine](training.md#trnroutine-routine) | Built |
| `TrnLogPast` | Training / Workouts | `app/workout/log.tsx` | [training.md#trnlogpast-log-past-workout](training.md#trnlogpast-log-past-workout) | Built |
| `TrnLibrary` | Training / Exercises | `app/workout/exercises.tsx` | [training.md#trnlibrary-exercise-library](training.md#trnlibrary-exercise-library) | Built |
| `TrnPicker` | Training / Exercises | `app/workout/exercises.tsx?pick=1` | [training.md#trnpicker-add-exercises](training.md#trnpicker-add-exercises) | Built |
| `TrnBuildEquip` | Training / Exercises | `app/workout/new-exercise.tsx` | [training.md#trnbuildequip--trnbuildmuscles--trnbuildreview-exercise-builder](training.md#trnbuildequip--trnbuildmuscles--trnbuildreview-exercise-builder) | Built |
| `TrnBuildMuscles` | Training / Exercises | `app/workout/new-exercise.tsx` | same section | Built |
| `TrnBuildReview` | Training / Exercises | `app/workout/new-exercise.tsx` | same section | Built |

### Progress

| Board | Canvas page | Route or component | Build directions | Status |
|---|---|---|---|---|
| `PrgMain` | Progress | `app/(tabs)/progress.tsx` and `components/progress/*` | [progress.md#prgmain-progress-full-scroll](progress.md#prgmain-progress-full-scroll) | Built |
| `PrgEmpty` | Progress | `app/(tabs)/progress.tsx` first-run state | [progress.md#prgempty-nothing-logged-yet](progress.md#prgempty-nothing-logged-yet) | Built |
| `PrgWeightSheet` | Progress | `components/progress/WeightEntrySheet.tsx` | [progress.md#prgweightsheet-log-weight](progress.md#prgweightsheet-log-weight) | Built |
| `PrgWeightEdit` | Progress | `WeightEntrySheet` edit mode | [progress.md#prgweightedit-edit-weight-entry](progress.md#prgweightedit-edit-weight-entry) | Built |

### Settings

| Board | Canvas page | Route or component | Build directions | Status |
|---|---|---|---|---|
| `SetIndex` | Settings | `app/(tabs)/settings.tsx` | [settings.md#setindex-settings](settings.md#setindex-settings) | Built |
| `SetProfile` | Settings | `app/settings/profile.tsx` | [settings.md#setprofile-profile](settings.md#setprofile-profile) | Built |
| `SetNutrition` | Settings | `app/settings/nutrition.tsx`, `NutritionSection` | [settings.md#setnutrition-nutrition-settings](settings.md#setnutrition-nutrition-settings) | Built |
| `SetTraining` | Settings | `app/settings/training.tsx`, `TrainingSection` | [settings.md#settraining-training-settings](settings.md#settraining-training-settings) | Built |
| `SetTargets` | Settings | `app/settings/weekly-volume-targets.tsx` | [settings.md#settargets-weekly-volume-targets](settings.md#settargets-weekly-volume-targets) | Built |
| `SetPreferences` | Settings | `app/settings/preferences.tsx` | [settings.md#setpreferences-preferences](settings.md#setpreferences-preferences) | Built |
| `SetNotifications` | Settings | `app/settings/notifications.tsx` | [settings.md#setnotifications-notifications](settings.md#setnotifications-notifications) | Built |
| `SetAccount` | Settings | `app/settings/account.tsx`, `AccountSection` | [settings.md#setaccount-account](settings.md#setaccount-account) | Built |
| `SetSignIn` | Settings | `app/account.tsx`, `AuthForm` | [settings.md#setsignin-sign-in](settings.md#setsignin-sign-in) | Built (chrome); AuthForm content by onboarding |
| `SetIntegrations` | Settings | `app/settings/integrations.tsx` | [settings.md#setintegrations-integrations](settings.md#setintegrations-integrations) | Built |
| `SetData` | Settings | `app/settings/data-privacy.tsx` | [settings.md#setdata-data-and-privacy](settings.md#setdata-data-and-privacy) | Built |
| `SetAbout` | Settings | `app/settings/about.tsx` | [settings.md#setabout-about](settings.md#setabout-about) | Built |
| `SetSupport` | Settings | `app/settings/support.tsx` | [settings.md#setsupport--setfeedback-support-send-feedback-report-a-problem](settings.md#setsupport--setfeedback-support-send-feedback-report-a-problem) | Built |
| `SetFeedback` | Settings | `app/settings/feedback.tsx`, `report-problem.tsx`, `SupportComposer` | same section | Built |
| `SetLegal` | Settings | `app/settings/privacy-policy.tsx`, `terms.tsx` | [settings.md#setlegal-privacy-policy-and-terms](settings.md#setlegal-privacy-policy-and-terms) | Built |

### Direction boards (reference only)

The first boards on the Direction page (`Nutrition`, `NutritionDark`, `Session`, `WorkoutDone`, `Progress`, `Goals`) were the first exploration. The pages above supersede them; use them only for the dark-mode look of those screens. They still date things Thursday 23 October.

Routes without a board: `app/index.tsx` (routing only), `app/spotify-auth.tsx` (redirect), `app/(tabs)/_layout.tsx` and other layouts.

## Decisions to confirm with the owner

Do not build these until confirmed. Each guide references them by number.

| # | Decision | Default if not decided |
|---|---|---|
| D1 | Suggested calorie and macro targets in onboarding (needs a formula, likely age and sex) | Prefill existing values, hide the "Suggested" tag |
| D2 | Backup counts on the restore screen (needs a remote count query) | Show the list without numbers |
| D3 | A "Burned" figure (per day on the dashboard, per workout on the detail screen) | Show Goal and Planned on the dashboard; Duration on the workout |
| D4 | A daily water target | Show the total only |
| D5 | Small additions: training week strip, record tags in history, live record star, day-detail workout row and day arrows, calendar day summary | Build them; they use existing data |
| D6 | Custom "Still training?" dialog instead of the native Alert | Keep the native Alert, update its message |
| D7 | Multi-select in the exercise picker | Keep single-tap add |
| D8 | Accent color (Indigo, Plum or Pine) | Indigo |

## Definition of done (per screen)

- Matches the board in light and dark at default text size; reflows at the largest text size.
- Uses only theme tokens and the foundations primitives; no hardcoded hex.
- Accessibility labels, roles and states as on the board.
- Behavior unchanged except confirmed **New** items; tests updated; lint, typecheck and tests pass.
- `DESIGN.md` baseline and the area doc in `docs/architecture/` updated when behavior or components change.
- Mark the board row "Built" in this directory (add a column if useful).

# Onboarding guide

Canvas page: **Onboarding**. Board sources: `boards/Onb*.dc.html`. Read [foundations.md](foundations.md) first. Behavior reference: `docs/architecture/auth.md`, `docs/architecture/preferences.md`.

Current flow: `app/onboarding/index.tsx` (welcome, account offered first) then `account.tsx` (AuthForm) then `goals.tsx` (one long form) then `complete.tsx`. The redesign keeps the routes and auth logic and changes layout, splits the goals form into two steps, and adds a restore screen.

Flow on the boards: Welcome, then Create account (optional), Restore (only when a backup exists), About you, Daily targets, All set. Progress line shows 3 steps: account, about you, targets.

## OnbWelcome: Welcome

- **Route:** `app/onboarding/index.tsx`.
- **Keep:** all branching in this file (restart, `accountsAvailable`, `signedIn && restorePending`, busy and message states), `AppleSignInButton`, `goToAccount('signUp' | 'signIn')`, `applyAuthRoute`.
- **Layout, top to bottom:** two soft decorative circles behind content (`emberSoft` top left, `tintSoft` right; `accessibilityElementsHidden`, `pointerEvents="none"`); the dinosaur (`assets/images/icon.png`, 132 px, replaces the 🏋️ emoji); headline `heading` 40/800 "Eat, train and watch it add up."; body 17 `icon` "Log a meal in seconds, run your workouts and see the weeks take shape. No account needed to start."; three chips on `cardBackground` with dots (protein, tint, ember): Nutrition, Training, Progress; spacer; buttons: Sign up with Apple (`ink`, lg), Sign up with email (`secondary` on card, lg), Continue without an account (`ghost`, lg), line "Already have an account? Sign in".
- **States:** busy shows an activity indicator under the buttons and disables them; `message` shows under the buttons in `danger` for errors.
- **Copy:** new headline and body replace "Track your nutrition with precision. Built on what the research actually says." Confirm with the owner if they want to keep the old line.

## OnbAccount: Create account

- **Route:** `app/onboarding/account.tsx` with `components/auth/AuthForm.tsx`. The same form serves `app/account.tsx` (see Settings guide, SetSignIn).
- **Layout:** back row with a 3-segment progress line (step 1 active) on the right; heading "Back up your log"; body "Your data lives on this phone either way. An account keeps a copy safe and moves it to a new phone."; Email field (focused state shown); Password field with show/hide icon button and hint "At least 8 characters."; Create account (primary lg); "or" divider; Continue with Apple (`ink` lg); footer "By continuing you agree to the Terms and Privacy Policy" linking to `/settings/terms` and `/settings/privacy-policy`.
- **Implementation:** restyle `AuthForm` with `TextField` and `Button`; keep its validation (`lib/auth-validation.ts`) and error messages. The progress line is a small `StepProgress`-like bar; reuse `components/workouts/StepProgress.tsx` styling or add a variant.

## OnbRestore: Restore your data

- **Route:** today this is a button state inside `app/onboarding/index.tsx` (`signedIn && restorePending`). Either render this layout in that branch or add `app/onboarding/restore.tsx` and route to it from the same condition. Do not change restore logic (`lib/restore.ts`).
- **Layout:** dinosaur with a small tint badge (circular arrow); heading "Welcome back"; body "We found a backup for <email>. Bring it onto this phone?"; list group of what the backup holds; Restore data (primary lg); Start fresh on this phone (ghost); caption "Starting fresh keeps your backup in your account."
- **New:** the counts list (food log days, workouts and routines, weight entries, last backup date) needs a lightweight remote count query before restore. If that is not wanted, show the list without numbers or drop it. Decision item D2 in the README.

## OnbStats: About you

- **Route:** split of `app/onboarding/goals.tsx`. Recommended: keep one route with an internal `step` state (`stats` then `targets`) so saving and validation stay in one file; or add `app/onboarding/stats.tsx` and pass values forward.
- **Layout:** back row, progress line (step 2), Skip link on the right; heading "A little about you"; body "We use this to suggest targets. Skip anything you'd rather not share."; Imperial / Metric `SegmentedControl` (writes the units preference, `lib/units.ts`); two cards side by side: Weight (big field, unit suffix) and Height (ft + in, or cm in metric); "How active are you?" radio list with descriptions (Sedentary "Desk job, little exercise", Light, Moderate, Active, Very active "Physical job plus training"; existing levels and copy); Continue.
- **Data:** writes profile weight (logs a weight entry, see `docs/architecture/weight.md`), height and activity exactly as `goals.tsx` does now. Keep current validation messages ("Enter a positive height in cm." etc.).

## OnbTargets: Daily targets

- **Route:** second step of the split above.
- **Layout:** back row, progress line (step 3); heading "Your daily targets"; body "A starting point from what you told us. Adjust anything."; Calories card with big inline field, "Suggested" tag and a caption explaining the basis; macro card with three rows (dot, name, "% of calories", mini field with g); energy split bar (protein, carbs, fat flex by share); caption "Macros add up to N cal. You can change targets any time in Settings."; Save targets.
- **Data:** saves goals with the same function and validation as `goals.tsx` ("Please fill in all calorie and macro goals.").
- **New:** suggested targets. The app does not compute suggestions today ("Used for goal suggestions in future updates"), and a standard formula needs age and sex, which onboarding does not collect. Until decided (README D1), prefill with the user's existing values or leave blank and hide the "Suggested" tag. The live "% of calories" and "add up to" caption are pure calculations; implement them in a small pure helper with tests.

## OnbComplete: All set

- **Route:** `app/onboarding/complete.tsx`.
- **Layout:** scattered small decorative shapes (macro colors, ember, tint; hidden from accessibility; omit or keep static under Reduce Motion); dinosaur in an `emberSoft` circle; heading "You're all set"; two chips with the saved calories and protein; section "Start with" and two tappable cards: Log your first food (to `/food-search`) and Start a workout (to `/workout/session`); Go to Today (primary lg) using `homeRouteFor()`.
- **New:** the two first-action cards (simple navigation, low risk).
- **Copy:** replaces "You're all set! Your goals have been saved. Start logging your food to track your progress." and the "Start Tracking" button.

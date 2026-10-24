# Settings guide

Canvas page: **Settings** (rows "You and the app" and "Account, data and help"). Board sources: `boards/Set*.dc.html`. Read [foundations.md](foundations.md) first. Behavior reference: `docs/architecture/preferences.md`, `docs/architecture/auth.md`, `docs/architecture/integrations.md`, `docs/architecture/data-and-sync.md`.

Shared: every destination uses `components/settings/SettingsPage.tsx`. Restyle it once: back row with the previous screen's name, `largeTitle`, optional trailing action, then content with 12 to 14 gaps. Rows become `ListGroup` / `ListRow`. Forms save explicitly; simple preferences save immediately and show errors (unchanged).

## SetIndex: Settings

- **Route:** `app/(tabs)/settings.tsx` (`SettingsRow`, `useAuth`, `useSyncStatus`, `lib/settings-destinations.ts`).
- **Layout:** `largeTitle`; account card (dinosaur avatar, email or "Not signed in", sync dot and "Backed up 2 min ago"; taps to Account); groups with section labels: You (Profile, Nutrition, Training), App (Preferences, Notifications, Integrations), Account and data (Account, Data and privacy), Help (Support, About). Each row: colored `IconTile` (tint for You, ember for Notifications, neutral otherwise), title, trailing detail (current weight, calorie goal, effort metric, units, reminder count, connected integrations), chevron.
- **New:** account card and trailing details (all data already available through existing hooks).

## SetProfile: Profile

- **Route:** `app/settings/profile.tsx` (`lib/profile-settings.ts`).
- **Layout:** back, Save (link); "Body" list: Weight (mini field with unit; caption "Weight comes from your latest entry. Changing it here logs today's weight."), Height (ft and in, or cm); "Activity level" radio list with descriptions and a tint check on the selected row; caption "Used for target suggestions and calories burned."
- **Note:** check that the caption is true for the shipped app (activity level feeds expenditure?). If not, use the current helper text.

## SetNutrition: Nutrition settings

- **Route:** `app/settings/nutrition.tsx` with `components/settings/NutritionSection.tsx` (`lib/nutrition-settings.ts`).
- **Layout:** "Daily goals" card: Calories big field; macro rows (dot, name, share %, mini field, g) with inline errors ("Enter a number, like 250."); energy split bar; "Meals" list of meal names with reminder and target summaries plus "Manage meals and reminders" (to dashboard edit mode, existing link); `StickyFooter` with error count and Save goals.

## SetTraining: Training settings

- **Route:** `app/settings/training.tsx` with `components/settings/TrainingSection.tsx`.
- **Layout:** card with "Effort per set" `SegmentedControl` None / RIR / RPE (replaces `PillSwitch`) and caption; list: Rest timer (native `Switch`, caption), Default sets (`Stepper`, labels "Fewer default sets" / "More default sets"); list: Weekly volume targets (trailing count of targets set), Units (to Preferences, trailing "lb, mi"); caption "Set rest per exercise from its options in a workout. Choose No rest to skip it."

## SetTargets: Weekly volume targets

- **Route:** `app/settings/weekly-volume-targets.tsx` (`lib/workouts/targets.ts`).
- **Layout:** back to Training; `largeTitle` 30 "Weekly volume targets"; helper "Working sets per muscle each week. Optional: enter 1 to 40, or leave blank."; Use recommended (`soft`, fills blanks only); list with column header (Region, This week, Target); rows with this week's count and a mini field; inline error "Enter 1 to 40 sets."; `StickyFooter` Cancel and Save (disabled while errors).
- **Keep:** unsaved-changes guard, missing daily goals redirect ("Nutrition settings"), loading and retry states.

## SetPreferences: Preferences

- **Route:** `app/settings/preferences.tsx` (`UnitsSection`, `usePreferences`).
- **Layout:** "Appearance" card with three preview tiles (System split light and dark, Light, Dark), selected tile has a tint border and check; "Units" card with Metric / Imperial `SegmentedControl` and caption "Imperial shows lb, mi, ft and in. Metric shows kg, km and cm. Your data is the same either way."

## SetNotifications: Notifications

- **Route:** `app/settings/notifications.tsx` (`lib/notification-permissions.ts`, `lib/reminders.ts`).
- **Layout:** intro "Only the reminders you ask for. Nothing promotional, ever." (true today: the app only schedules reminders and rest alerts); permission card (`successSoft` check "Allowed" or ember warning "Off" with System settings button; requesting state while asking); "Meal reminders" list with times ("Off" in `icon`), Manage meal reminders link, caption "In Nutrition, tap Edit, then a meal, to choose its reminder time."; "Workouts" list: Rest timer (to Training settings).

## SetAccount: Account

- **Route:** `app/settings/account.tsx` with `components/settings/AccountSection.tsx` (`lib/auth-*`).
- **Layout:** card with initial avatar, email, sign-in method, nested sync row ("Backed up 2 min ago", Sync now); list: Change password, Sign out, caption "Signing out removes your log from this phone. Your backup stays in your account."; "Delete" section: Delete account and backup (`danger`), Remove data from this phone only, caption "Deleting is permanent. Export your data first from Data and privacy."
- **Keep:** every branch of `AccountSection` (anonymous state with Sign in / Sign up with email, "Your data has not been restored", Restore data, Finish deletion) styled with the same primitives. Destructive actions keep their confirmations.

## SetSignIn: Sign in

- **Route:** `app/account.tsx` (modal) with `AuthForm` in sign-in mode.
- **Layout:** modal Close; heading "Welcome back"; body "Sign in to restore your log. Anything you've logged on this phone is kept and merged." (matches the merge behavior in `docs/architecture/auth.md`); Email; Password with "Forgot password?" link (existing recovery flow); inline error "That email and password don't match."; Sign in; or; Sign in with Apple; "New here? Create an account".

## SetIntegrations: Integrations

- **Route:** `app/settings/integrations.tsx` (`useSyncStatus`, `use-health-kit`, `useSpotifyConnection`).
- **Layout:** three cards. Cloud sync: icon, title, caption, "On" tag, nested rows Last successful sync and Pending changes. Apple Health: white tile with red heart, "Syncs your weight both ways", Connected tag, Last Health sync row, Sync now (soft) and Permissions (secondary). Spotify: green tile, "Pick a playlist when you start a workout", Connect Spotify (or connected state with account and Disconnect).
- **States:** keep "Unavailable in this build", "Access ended", paused sync messages; show them as the tag plus a caption.

## SetData: Data and privacy

- **Route:** `app/settings/data-privacy.tsx` (`ExportDataSheet`, `DestinationRow`).
- **Layout:** intro; Backup coverage card (check rows for backed-up data, dash for device-only: units, appearance and reminders) plus Unsynced changes count; list: Export data (opens `ExportDataSheet`), Restart setup (existing copy), Privacy policy.
- **Note:** verify the coverage rows against `docs/architecture/data-and-sync.md` before shipping; the board lists food logs, meals, custom foods, goals, profile, workouts, routines, exercises and weight as backed up.

## SetAbout: About

- **Route:** `app/settings/about.tsx`.
- **Layout:** dinosaur, "BinoFit", "Nutrition and training tracking.", version and build from `lib/app-info.ts` (board shows placeholders); "Food data" list: USDA FoodData Central ("SR Legacy and Foundation food data"), Open Food Facts (ODbL text, Visit source and Read the data license buttons, existing links); list: Privacy policy, Terms of service; footer line "Made with care, and a small pink dinosaur." (optional, owner's call).

## SetSupport / SetFeedback: Support, Send feedback, Report a problem

- **Routes:** `app/settings/support.tsx`; `app/settings/feedback.tsx` and `app/settings/report-problem.tsx` both render `components/settings/SupportComposer.tsx`.
- **Support layout:** intro "Tell us what's working and what isn't."; two cards: Report a problem (`dangerSoft` warning tile) and Send feedback (`emberSoft` bulb tile); "What to include" card with bullets.
- **Composer layout:** `largeTitle`; Idea / Problem `SegmentedControl` (maps to the two routes; or keep two routes and drop the control); message field with character count; nested info note keeping the existing privacy line "Only your message, app version and build are included. No logs or diagnostics are attached."; Send.

## SetLegal: Privacy policy (and Terms)

- **Routes:** `app/settings/privacy-policy.tsx`, `app/settings/terms.tsx`.
- **Layout:** back; `largeTitle`; "Last updated" caption; `tintSoft` "The short version" card with check bullets; sections with `title` headings and body text, max width about 358. Use the real policy text already in these files; the board shows placeholders only. Terms uses the same layout without the summary card unless the owner writes one.

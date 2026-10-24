# Preferences, Settings and home routing

## App preferences

Device-only, in AsyncStorage (`lib/storage.ts`): appearance, weight unit, effort per set, effort scale, rest timer switch, default set count, default food status (eaten | planned) and the active rest timer.

- `lib/app-preferences.ts` is a pub/sub store loaded once at launch (`loadPreferences`, write-through setters). Read it with `usePreferences`.
- `loadPreferences` removes any leftover `tracking_mode` key from older installs.
- Sign-out clears the rest timer and keeps appearance, unit, effort per set, effort scale, rest timer switch and default set count.
- Storage keys: `showEffort` keeps the old `show_rpe` key; `effortMetric` (`'rpe' | 'rir'`, default rpe, key `effort_metric`) picks the single effort column (the hidden metric's values stay stored; None turns effort off without changing the saved scale or either set value); `restTimerEnabled` (key `rest_timer_enabled`, only the string `'false'` is off).

## Units

`lib/units.ts` is pure. Weight is stored in kg and distance in metres; display follows the unit (kg with km, lb with mi). Fresh users default to lb/mi; preserve saved kg or lb preferences.

## Settings

Settings is a compact directory with focused Profile, Nutrition, Training, Preferences, Notifications, Account, Integrations, Data and privacy, About and Support destinations under `app/settings/`. The Nutrition and Training tab gears open the same settings routes. Forms save explicitly; simple preferences save immediately and show errors.

- Directory (`app/(tabs)/settings.tsx`): an account card (email or "Not signed in" with the backup status line, opening Account), then four groups (You, App, Account and data, Help) of rows with an `IconTile`, a title and a value from `lib/settings-summaries.ts` (weight, calorie goal, effort scale, units, reminder count or permission, connected integrations). Integrations reads the Health flag from storage without mounting `useHealthKit`.
- `components/settings/SettingsPage.tsx`: back row named for the previous screen (`previousScreenTitle` in `lib/settings-screens.ts` from the navigation state, "Back" when unknown), large title (`heading` for Weekly volume targets), optional trailing action and `StickyFooter`. `SettingsRow` is retired; screens use `ListGroup` and `ListRow`.
- Profile saves from the header. Activity level is a radio list with the shared labels and descriptions in `lib/profile-settings.ts`.
- Notifications lists each meal's reminder time (or Off) and the rest timer alert; Account shows the backup panel with Sync now; Integrations is three cards (Cloud sync, Apple Health, Spotify) with status tags; Data and privacy lists what is backed up and what stays on the phone, with the unsynced count.

- About credits Open Food Facts under the Open Database License (ODbL), with accessible source and license links, and USDA FoodData Central. Privacy Policy describes remote search and barcode lookups; Terms names both food sources.
- `components/settings/UnitsSection.tsx` in Preferences: Metric or Imperial (`SegmentedControl`), including height. Appearance is three preview tiles (System, Light, Dark) as a radio group.
- `components/settings/TrainingSection.tsx` in Training: Effort per set None / RIR / RPE (`SegmentedControl`), Rest timer switch, Default sets (`Stepper`). `PillSwitch` is no longer used by Training or Units; it stays for the nutrition screens.
- Nutrition Settings (`components/settings/NutritionSection.tsx`) owns Daily goals and Meals. Fields validate live with an inline error and an energy split bar; the route saves from a `StickyFooter` ("Fix N fields to save", "Goals saved") while the sheet keeps an inline Save goals button. Saving always validates goals. Default for new food is on the Nutrition dashboard instead (see [nutrition.md](nutrition.md)).
- The weight field shows the latest weight entry and saves an entry only when changed (see [weight.md](weight.md)).

## Home routing

Users always track nutrition and training. `lib/tracking-mode.ts` (pure): `isTabVisible(tab)` is always true; `homeRouteFor()` always returns `'/(tabs)'`. Every navigation to the app's home must use `homeRouteFor()`, never a literal tab path. `app/index.tsx` waits for onboarding and `loadPreferences` before routing. After sign-in, `hasRestoredData` decides between the tabs and the goals step (see [auth.md](auth.md)).

## Weekly volume targets

Training settings links to Weekly volume targets, also opened by the Training Sets card. This form saves explicitly, protects unsaved navigation, validates each region live ("Enter 1 to 40 sets."), shows this week's working sets beside each target, saves from a `StickyFooter`, and retains drafts after save errors. Optional recommended values are editable starting values and only fill blank fields. Targets belong to the synced goals record, not device preferences. Missing daily goals require setup in Nutrition settings before targets can be saved.

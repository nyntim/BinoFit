# Nutrition guide

Canvas page: **Nutrition** (rows "Today" and "Logging food"). Board sources: `boards/Nut*.dc.html`. Read [foundations.md](foundations.md) first. Behavior reference: `docs/architecture/nutrition.md`, [ADR 0002](../../decisions/0002-user-defined-meals.md) (meals are user-defined), [ADR 0013](../../decisions/0013-progress-counting-rules.md) (eaten vs planned).

Rules that do not change: meal names via `nameForDate` / `mealsForDay`; daily consumed totals count eaten food only; every write is followed by fire-and-forget `syncToSupabase()`; deletes tombstone.

Build order: Dashboard, Serving picker, Search (three boards), Batch review, Meal summary, Edit meals and Meal sheet, Water, Calendar, Day detail, Scanner boards, Custom food.

## NutDashboard: Nutrition dashboard (full scroll)

- **Route:** `app/(tabs)/index.tsx` (839 lines; extract sections into `components/dashboard/` as you go).
- **Reuse:** `CalendarWidget`, `StreakBadge`, `SyncIndicator`, `CalorieStat`, `calorie-ring`, `macro-bar`, `DayWorkouts` / `useDashboardTraining`, `WaterModals`, `MealSlotCard`, `FoodLogRow`, `PillSwitch` (becomes `SegmentedControl`), `useMealLogs`, `useMealDefinitions`, `usePreferences`, `useSwipeDayNavigation`.
- **Layout, top to bottom:**
  1. Date line ("Friday, 23 October") left; right: sync status (dot plus "Synced", from `SyncIndicator`) and the streak chip (`ember` chip with flame, "6 days", taps to Progress).
  2. Title row: `largeTitle` "Today" (or the date when not today); Edit (`soft` button, 44 pt) and settings icon button (to `/settings/nutrition`).
  3. Week strip card: 7 days Mon to Sun, selected day filled `tint` circle, two marker dots per day (food `tint`, trained `ember`), chevron to open the month calendar. Same data as `CalendarWidget`; restyle it.
  4. Calorie card: ring (136 px, 13 stroke, `track` behind `tint`), center `hero` eaten calories plus "of 2,250 cal"; right column: Left (stat), separator, then two small stats.
  5. Macro card: three `ProgressBar`s with "value / goal g".
  6. Training card (only when there are workouts that day): icon tile, workout name, "duration · volume", `ember` tag "N records" when the workout set records. Taps to `/workout/[id]`. Restyle `DayWorkouts`.
  7. Water card: "Water" title, "1.25 of 2.5 L", a quick-add `soft` button (first quick drink) and a "+" button that opens the drink sheet; a row of 10 segments filled in `fat` blue.
  8. "New food is" with an Eaten / Planned `SegmentedControl` (the existing default-status preference).
  9. Meal cards, one per meal: header (name `title`, status `Tag` Eaten tinted or Planned neutral, macro summary caption, calories `stat` right); food rows (name, serving, calories); "+ Add food" row. Planned meals get a 1.5 px dashed `fieldBorder` outline. Tapping the header opens the meal summary (existing behavior).
  10. Floating tab bar.
- **States:** Meal with no food shows "No food logged" as the summary and just the Add row. Over goal is neutral (the ring stays full, "Left" becomes "Over" with the number; never red).
- **Stats:** today the calorie card shows Goal / Eaten / Remaining. The board shows Left plus two small stats. Recommended mapping: Left = Remaining; small stats = Goal and Planned (planned calories for the day, a sum the dashboard already has via slot status). "Burned" on the board is **New** (README D3): there is no per-day burn today, only the 21-day expenditure estimate on Progress. Do not invent a number.
- **Water:** amounts follow the unit preference (oz for imperial, ml for metric); existing quick-add drinks are in oz. A daily water target does not exist; if there is none, show only the total and a fill relative to a neutral 8-glass row, or ask (README D4).

## NutEdit: Edit meals

- **Route:** dashboard edit mode (`useMealDraft`, `ReorderableList`, `EditModeBar`). Not a new route.
- **Layout:** `largeTitle` "Edit meals" with Cancel; caption "Rename, reorder or remove meals. Changes apply from today."; one card per meal: drag handle (accessible reorder label), name `TextField`, remove button (`danger` minus circle), and a line with reminder and target summary plus "Targets and reminder" link (opens `MealSettingsSheet`); dashed "+ Add meal" button; `StickyFooter` with error count and Done.
- **States:** empty name shows the field error "Give this meal a name."; Done is disabled while errors exist ("Fix 1 error to save"). Keep "At least one meal is required".

## NutMealSheet: Meal targets and reminder

- **Component:** `components/dashboard/MealSettingsSheet.tsx`.
- **Layout:** sheet with grabber; `SheetHeader` Cancel / meal name / Save; "Targets for this meal" nested panel with rows (dot, name, mini field, unit) for Calories, Protein, Carbs, Fat, placeholder "None"; caption about blank targets; "Reminder" nested panel: Remind me daily switch, Time button (opens `time-picker-sheet`); when notifications are denied, an `emberSoft` notice "Notifications are off for BinoFit." with "Open settings".
- **Behavior:** unchanged (`lib/reminders.ts`, permission only requested when a reminder is turned on).

## NutMealSummary: Meal nutrition summary

- **Component:** `components/dashboard/MealNutritionSummary.tsx` with `lib/meal-nutrition-summary.ts` (pure, keep).
- **Layout:** modal page with Done; `heading` meal name plus status tag; "date · N foods"; energy card (ring only when the meal has a calorie target, center calories, "Meal target" and neutral "20 left" / "Over by"; stacked energy-share bar with percentage legend); three macro tiles (dot, label, value with 1 decimal, small bar vs meal target, "of N g"); Nutrients card grouped by category with a coverage `Tag` per group (Complete tinted, "1 of 2 foods" neutral, Unknown neutral) and unknown values in `icon` color.

## NutCalendar: Month calendar

- **Component:** `CalendarWidget` expanded modal (`react-native-calendars`) or `components/month-calendar.tsx`.
- **Layout:** bottom sheet; month title in rounded type with previous / next icon buttons; weekday header Monday first; day cells 34 px circles, selected filled `tint`, future days `icon` color, two marker dots (food `tint`, trained `ember`); legend; a nested panel for the selected day ("Fri 23 Oct", "1,100 cal eaten · Push day, 58 min") with "Go to day".
- **Note:** the selected-day summary panel is light **New** work (data exists in the dashboard loaders).

## NutWater: Add a drink

- **Component:** `components/dashboard/WaterModals.tsx` (`CustomWaterModal`, `QuickAddSearchModal`).
- **Layout:** sheet; Cancel / "Add a drink" / Add; big amount (`hero`) with today's total before and after; four amount tiles (radio, selected `tintSoft` with tint border) with a small glass icon; "Other drinks" search field and saved quick drinks with amount and calories.
- **Note:** tile amounts must follow units (8, 12, 16, 24 oz in imperial). Merge the custom amount and quick-add search into this one sheet if practical; otherwise keep two modals with this styling.

## NutDayDetail: Past day

- **Route:** `app/day-detail.tsx` (read-only, opened from Progress bars and calendar days).
- **Layout:** back row ("Progress") with previous / next day icon buttons; `largeTitle` date and "Day summary"; card with Eaten `hero` vs Goal, thick progress bar, three macro mini bars; list of meals with calories and food names; workout row when there was one.
- **New:** previous / next day buttons and the workout row (README D5 lists small items). Over-goal macros fill the bar fully in their own color; no red.

## NutSearch: Food search

- **Route:** `app/food-search.tsx` (`lib/food-search-session.ts`, `useFoodSelection`). Modal.
- **Layout:** modal header: Cancel, centered "Add to Meal 2" with "date · Eaten" caption, Select (enters multi-select); search field (focused: 2 px tint border on card) with clear button; scan button (tinted 44 pt icon button, to `/barcode-scanner`); sort chips Best match / Recent / Frequent / Branded mapped to the existing sorts and sections; result list rows: name, source `Tag` (Recent tinted, USDA, Open Food Facts, Custom via `lib/food-source.ts`) plus serving, calories right, quick-add "+" button (separate from the row tap target; row tap opens the serving picker with `origin=search`); loading line "Searching branded foods…" while remote work is pending.
- **Keep:** debounce, remote rules, scroll-to-top on query change, Android keyboard padding, discard guards.

## NutSearchMulti: Select multiple

- **Route:** same screen in selection mode (`SelectionCheck`, `SelectionBar`).
- **Layout:** header Cancel / "3 selected"; search field; rows become checkboxes (selected rows `tintSoft`); floating `ink` selection bar: "3 foods" and summed "cal · P · C · F", Review button (to `/food-batch-review`).

## NutSearchEmpty: No results

- **Route:** same screen, final empty state.
- **Layout:** `EmptyState` with the dinosaur, "No matches yet", body with the query; Create "query" (primary, to `/custom-food` prefilled with name and meal/date context) and Scan a barcode (secondary). When remote search failed, a neutral bar at the bottom: "Branded foods couldn't load. Local results still work." with Retry.

## NutServing: Serving picker

- **Route:** `app/serving-picker.tsx` (772 lines; parts in `components/serving-picker/`, `useServingDayTotals`).
- **Layout:** modal header: back to Search, meal name, Log (primary small); food name `heading` 26 and source tag line; card: Amount with `Stepper` (inline editable value), unit chips (common units; keep `UnitPickerModal` behind a "More" chip when there are many), separator, Time button (time picker), Status Eaten / Planned `SegmentedControl`; nutrition card: macro-split ring (`NutritionRing`) with calories, three macro tiles, "Per 100 g" line (keep `MacroDetailPanel` expansion on tile tap); "Your day with this" card: four bars where the existing day amount is solid and this food is the pale segment (`TargetTints` or 38% opacity), label "after / goal".
- **Keep:** micronutrient expansion rows (`MicroExpandRow`), edit custom food entry point, `router.dismiss(2)` on Log from search.
- **New:** Stepper and unit chips are layout changes only.

## NutBatch: Review selected foods

- **Route:** `app/food-batch-review.tsx` (`BatchReviewItem`).
- **Layout:** modal header: back to Search, "Review", Clear all (`danger` text); heading "3 foods for Meal 2" and "date · Eaten"; one card per food: name, macro line, calories, remove "x"; Stepper plus unit selector button; sticky footer with Total (calories and macros) and "Log 3 foods".

## NutScanner: Barcode scanner

- **Route:** `app/barcode-scanner.tsx` (`fullScreenModal`, pad with safe-area insets). Always dark.
- **Layout:** camera full bleed; dim mask outside a 310 x 220 viewfinder with white rounded corner brackets and a tint scan line (static under Reduce Motion); top: close and flashlight (existing `torch` state) as 44 pt translucent white circles, title "Scan barcode"; bottom: "Point the camera at a barcode", "Products come from Open Food Facts", buttons Enter digits (translucent) and Search by name (white).
- **Keep:** permission states (Allow camera, Open Settings), lookup flow, manual entry validation copy.

## NutScanMiss: Barcode not found

- **Route:** state inside `app/barcode-scanner.tsx` (or the existing not-found handling that routes to `custom-food`).
- **Layout:** sheet over the dimmed camera: `emberSoft` icon tile, "Not found yet", body; Barcode field with the digits; Create food with this barcode (primary, to `/custom-food` with the barcode); Scan again and Search by name (secondary, side by side). Network failure keeps the existing "Couldn't reach Open Food Facts." message in the same sheet with Retry.

## NutCustomFood: Custom food

- **Route:** `app/custom-food.tsx`.
- **Layout:** modal Cancel / "New food" (or "Edit food") / Save; "Food" card: Name, Brand (optional), Serving size, barcode tag when present; "Nutrition per serving" card: Calories big field, Protein / Carbs / Fat fields in three columns with macro dots, caption "Macros add up to N cal."; "More nutrients (optional)" accordion list grouped like `lib/nutrients.ts`, each group header showing "filled of total", fields with "Unknown" placeholder; caption "Blank means unknown, not zero."
- **States:** missing required field shows inline error (serving size example on the board). Keep existing validation (`lib/food-validation.ts`).

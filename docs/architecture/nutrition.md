# Nutrition

## Dashboard (Nutrition tab, `app/(tabs)/index.tsx`)

- `components/dashboard/CalorieStat.tsx`, `QuickAddButton.tsx`, `WaterModals.tsx` (custom drink and quick-add drink search modals): dashboard pieces split out of the screen.
- `components/calorie-ring.tsx`, `components/macro-bar.tsx`: nutrition visualizations. `MacroBar` takes optional `goal`, `trackColor` and `decimalPlaces` (default 0).
- `components/CalendarWidget.tsx`: week strip plus full-month modal calendar (`react-native-calendars`). Shows logged-food and finished-workout markers plus the selected day's workouts (`DayWorkouts`). `useDashboardTraining` owns local workout date and detail refresh on focus, date, session, unit and local-day changes; CalendarWidget owns range-based food marker refresh on focus and log revision. The compact week preview keeps markers but hides the Logged/Trained legend; the expanded calendar shows the legend.
- `components/StreakBadge.tsx`: current logging streak, via `@/hooks/useStreak` (current and longest streak from logged dates, see [progress.md](progress.md)).
- `components/SyncIndicator.tsx`: sync pill (see [data-and-sync.md](data-and-sync.md)).

## Meals

Meals are user-defined. Resolve names with `nameForDate` / `mealsForDay` from `@/lib/meals` (via `@/hooks/useMealDefinitions`); never hardcode slot labels. Renames apply from today through the `MealNameEntry` history.

- Dashboard Edit mode edits a draft (`@/hooks/useMealDraft`) saved on Done by `saveMealDraft()`. Drag reorder is `components/dashboard/ReorderableList.tsx`.
- Reminders: `lib/reminders.ts` (`expo-notifications`, local only). `syncMealReminders(defs, names)` cancels all `meal-reminder:<id>` notifications and reschedules one daily notification per meal with `reminder_time`. Call `restoreMealReminders()` (fire-and-forget) after saving meals and on app start. Permission is requested only when a reminder is turned on (`MealSettingsSheet`).
- Default status for new food (eaten | planned) is a device preference, set above the meal list on the Nutrition dashboard; it saves immediately through the preference store. Daily consumed totals count eaten food only; a missing status means eaten.

## Meal nutrition summary

Tapping the meal card opens its read-only nutrition summary, including empty meals and orphan Other groups. Add, status and food-row actions keep their own interactions; edit-mode cards do not open summaries. There is no separate visible Nutrition link.

- `components/dashboard/MealNutritionSummary.tsx` displays live dashboard-owned logs and status, current meal targets, macro energy shares and catalog nutrients with unknown/partial coverage. No food-contributions section.
- Planned meals include all their food in the summary; daily consumed totals remain eaten-only.
- The dashboard loader uses a request generation and loaded date to reject stale responses. The summary closes on date change, edit or settings entry, or blur, and performs no reads or writes.
- `lib/meal-nutrition-summary.ts` holds the pure calculations. The summary uses `MacroBar` with 1 decimal place.
- Layout: title block with status tag, an energy card (`CalorieRing` only when the meal has a calorie target, neutral left/over text via `calorieDelta`, stacked macro energy bar), macro tiles, and one nutrients card with per-group coverage (`nutrientGroupCoverage`).

## Food search

`lib/food-service.ts` searches SQLite first, falls back to a Supabase remote query (4 or more characters) and caches results locally.

- Rows show calories in a right column and a neutral source tag from `lib/food-source.ts` (`foodSourceLabel`: USDA, Branded, Open Food Facts, Custom; `searchBranded` stamps `source: 'branded'`).
- `app/serving-picker.tsx` sets the amount, unit and time and logs or edits an entry. Its parts are in `components/serving-picker/` (form rows, nutrition ring, macro detail panel, targets, unit picker) and `hooks/useServingDayTotals.ts` (the day's other totals, goals and slot statuses).
- Selecting a food pushes `serving-picker` with `origin=search` so search state stays mounted: Back returns to it, Log calls `router.dismiss(2)`.
- Multi-select collects several foods and opens `food-batch-review` to log them together.
- A query or sort change scrolls results to the top; `hooks/useKeyboardHeight` pads lists on Android.

## Barcode scan

`app/barcode-scanner.tsx` is a full-screen camera scanner (native only, opened from the food search scan button). It looks up via `lookupBarcode`, then replaces itself with `serving-picker`, or `custom-food` (prefilled, with the barcode) when not found.

- `lib/open-food-facts.ts` (`normalizeBarcode`, `mapOffProduct`, `buildServingUnits`, `fetchOffProduct`; never throws, 8 s timeout) maps Open Food Facts products to `Food` rows (`id: off:{barcode}`, `source: 'open_food_facts'`).
- `lookupBarcode()` in `lib/food-service.ts` checks SQLite, then OFF, and caches found products. Not-found results and errors are never cached.

## Nutrients

`lib/nutrients.ts` owns the ordered 30-item `NUTRIENTS` catalog, canonical g/mg/ug units (`ug` displays as µg), `NutrientId`, `NutrientValues`, `normalizeNutrients` and `scaleNutrients`.

- Food nutrients are flat nullable columns/properties per base serving: null is unknown, zero is known. There is no parallel JSON store.
- Vitamins A/E/folate keep RAE / alpha-tocopherol / total-folate definitions; ambiguous source definitions stay unknown.
- The bundled USDA asset supplies extended nutrients. OFF standardized mass fields convert grams once; the contributor `_unit` does not rescale those values.
- Joined date/range reads hydrate `FoodLogWithFood.food_nutrients` in one query. `sumNutrientTotals`, `slotNutrientTotals` and `sumEatenNutrientTotals` return per-id `{total, knownCount, missingCount}`; a null total means no known items. Scale by stored `serving_amount` exactly once, keep precision, exclude tombstones, and exclude planned slots from eaten day coverage. Coverage counts log items, including duplicates, and is independent of source accuracy.

## Custom foods

Custom-food entry has optional grouped nutrient fields and can be edited from the serving picker. `updateCustomFood` only edits custom rows; edits affect every historical log of that food.

- Local foods carry `synced_at`. `getUnsyncedCustomFoods` / `markCustomFoodsSynced` use snapshot guards and back up unlogged definitions before logs in the retrying sync pass. Owner changes reset custom markers.
- Restore paginates owned foods; `applyRemoteCustomFoods` applies definitions before resolving missing log foods, keeps pending local edits and ties, and accepts newer remote null clears.
- The `micronutrient_food_columns` SQL in `supabase/schema.sql` must be deployed before releasing clients that use it.

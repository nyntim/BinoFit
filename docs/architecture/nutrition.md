# Nutrition

## Dashboard (Nutrition tab, `app/(tabs)/index.tsx`)

`app/(tabs)/index.tsx` keeps the state, loaders and handlers (request generation, focus reload, summary selection, edit draft, water handlers, HealthKit activity, scroll restore). The JSX lives in presentational sections in `components/dashboard/`:

- `DashboardHeader` (date line with `SyncIndicator` and `StreakBadge`, "Today" large title, Edit and Nutrition settings buttons; the "Edit meals" title while editing), `CalorieCard`, `MacroCard`, `DayWorkouts`, `WaterCard`, `ActivityCard`, `DefaultStatusRow`, `MealCardList` (view mode), `MealEditList` (edit mode), `EditModeBar`, `MealSlotCard`, `FoodLogRow`, `CalorieStat`.
- `CalorieCard` shows Left (or Over, neutral color), Goal and Planned (`sumPlannedTotals`); there is no Burned figure. Each figure is one accessible group, the ring has its own "X of Y calories" label, and at font scale 1.6 or more the ring reflows to a labelled bar. `CalorieRing` takes optional `strokeWidth`, `caption` and `accessibilityLabel`.
- The week strip sits inside the scroll, in a card. A day swipe animates only the day content under it; the header and week strip stay put.
- `MealSlotCard` is a card with a dashed outline when the meal is planned. The Eaten / Planned tag is a pressable `Tag` that switches the status. Edit mode shows `mealEditDetail` (reminder time and calorie target) and a "Targets and reminder" link.
- `DayWorkouts` renders one card per finished workout (title, duration, detail) that opens `/workout/{id}`. It no longer uses the training team's history row.
- `StreakBadge` is an ember chip that opens Progress; with no streak it is a neutral prompt. `SyncIndicator` is a dot and label shown only after sync has failed past the grace period; tap retries.
- Water (behind `WATER_TRACKING_ENABLED`, off): `WaterCard`, `WaterModals` (Add a drink sheet, quick drink search) and `QuickAddButton`. Logs stay stored in oz; display is ml / L for kg users and oz for lb users (`formatWater`, `waterPresets`, `mlToOz` in `lib/units.ts`). There is no target; the 10-segment row fills one segment per 8 oz glass.
- `components/calorie-ring.tsx`, `components/macro-bar.tsx`: nutrition visualizations. `MacroBar` (used by Progress) takes optional `goal`, `trackColor` and `decimalPlaces` (default 0).
- `components/CalendarWidget.tsx`: week strip plus month sheet (`react-native-calendars`, with the sheet's own month header and Previous / Next month buttons; Next is disabled past the planning limit, today + 7 days). Shows logged-food and finished-workout markers. Tapping a day in the month sheet previews it: the sheet shows the day's eaten calories and workouts (`hooks/useDaySummary.ts`, `lib/day-summary.ts`) and "Go to day" applies it and closes the sheet. Week strip taps select at once. `useDashboardTraining` owns local workout date and detail refresh on focus, date, session, unit and local-day changes; CalendarWidget owns range-based food marker refresh on focus and log revision. The sheet legend reads "Logged food" and "Trained".
- `components/StreakBadge.tsx`: current logging streak, via `@/hooks/useStreak` (see [progress.md](progress.md)).
- `components/SyncIndicator.tsx`: sync status (see [data-and-sync.md](data-and-sync.md)).

## Meals

Meals are user-defined. Resolve names with `nameForDate` / `mealsForDay` from `@/lib/meals` (via `@/hooks/useMealDefinitions`); never hardcode slot labels. Renames apply from today through the `MealNameEntry` history.

- Dashboard Edit mode edits a draft (`@/hooks/useMealDraft`) saved on Done by `saveMealDraft()`. Drag reorder is `components/dashboard/ReorderableList.tsx`.
- Reminders: `lib/reminders.ts` (`expo-notifications`, local only). `syncMealReminders(defs, names)` cancels all `meal-reminder:<id>` notifications and reschedules one daily notification per meal with `reminder_time`. Call `restoreMealReminders()` (fire-and-forget) after saving meals and on app start. Permission is requested only when a reminder is turned on (`MealSettingsSheet`).
- Default status for new food (eaten | planned) is a device preference, set above the meal list on the Nutrition dashboard; it saves immediately through the preference store. It is a segmented control labelled "Default status for new food". Daily consumed totals count eaten food only; a missing status means eaten.

## Meal nutrition summary

Tapping the meal card opens its read-only nutrition summary, including empty meals and orphan Other groups. Add, status and food-row actions keep their own interactions; edit-mode cards do not open summaries. There is no separate visible Nutrition link.

- `components/dashboard/MealNutritionSummary.tsx` displays live dashboard-owned logs and status, current meal targets, macro energy shares and catalog nutrients with unknown/partial coverage. No food-contributions section.
- Planned meals include all their food in the summary; daily consumed totals remain eaten-only.
- The dashboard loader uses a request generation and loaded date to reject stale responses. The summary closes on date change, edit or settings entry, or blur, and performs no reads or writes.
- `lib/meal-nutrition-summary.ts` holds the pure calculations.
- Layout: title block with status tag, an energy card (`CalorieRing` only when the meal has a calorie target, neutral "N left" / "Over by N" text via `calorieDelta`, segmented macro energy bar), macro tiles (grams, a bar against the meal target when set), and one nutrients card with per-group coverage tags (`nutrientGroupCoverage`: Complete, Unknown or N of M known). Unknown values read "Unknown".

## Food search

`lib/food-service.ts` searches complete local name/brand metadata, then hydrates only accepted IDs. The immutable bundled USDA metadata is pre-tokenized once per process; local metadata is read again on each search so custom edits and cache inserts are visible. All significant query words must match; no mid-word substring or partial-word floor remains. Exact/plural tokens outrank final-token prefixes, then one-edit typos only for query words of six or more characters. Personal history is bounded inside relevance buckets. See [the decision record](../food-search-relevance.md) for matching fixtures, sources and measurements.

- `lib/food-search-session.ts` owns each mounted screen/account's 150ms local debounce, 700ms remote quiet period, request cancellation and 100-key successful-result LRU. Automatic remote search requires at least three normalized characters and fewer than eight strong local rows; keyboard submit and Load branded foods are immediate. Sort changes only reorder current result sets. Empty/changed queries, account changes and unmount invalidate generations synchronously. Errors/timeouts/aborts do not become negatives. Short final-prefix negative inference stops before typo eligibility; exact repeats reuse results.
- Remote search calls the compatible authenticated `search_foods` RPC (up to 20 rows), which combines indexed simple-dictionary FTS, final prefix and controlled trigram candidates with an all-word relevance gate. It retains legacy `exclude_ids`, while new clients dedupe IDs locally. Popularity cannot outrank a better match-quality bucket.
- Remote summaries keep actual source provenance (`open_food_facts` fallback) and runtime `detailsPending: true`; they are not persisted as complete foods. `needsRemoteDetails` hydrates selections independently of source. Full profiles retain existing nutrient-cache behavior.
- Unbranded serving-picker foods use `foodSourceLabel` for readable provenance.
- Rows are grouped in a card per section and show the name, a neutral source tag from `lib/food-source.ts`, the serving and calories (macros stay in the accessibility label). The header shows the meal and day with the status new food will get (`hooks/useNewFoodStatus.ts`). Sort chips are a radio group ("Best match", Recent, Frequent, A to Z, Z to A).
- Select mode: the header shows "N selected" with Cancel selection and Clear; a floating bar shows the count, the batch totals (`batchTotals`) and Review.
- A single final empty state ("No matches yet") offers Create "query" (opens `custom-food` with `name`) and, on native, Scan a barcode; while remote work is pending, show loading. Remote failure leaves local results available and shows a bar with Retry in place of the Load branded foods button. Existing navigation discard guards protect selections.
- `app/serving-picker.tsx` sets the amount, unit and time and logs or edits an entry. Its parts are in `components/serving-picker/` (nutrition ring, macro detail panel, target rows, expandable nutrient summary) and `hooks/useServingDayTotals.ts` (the day's other totals, goals and slot statuses).
  - The amount is a `Stepper` around the amount field: Less / More step by 0.5 servings, 10 g or 0.5 oz (`stepServingAmount` in `lib/food-validation.ts`) and Less is disabled at the minimum. The unit is a radio group of chips: the food's serving, and g and oz when the food has base grams. There are never more than three, so there is no separate unit picker.
  - The Status row is a read-only tag: the slot's current status for an edit, otherwise what the new food will get (`newFoodStatus`). Status is per meal and changes on the dashboard meal card.
  - "Your day with this" shows each target with this food as a pale segment.
- Remote summaries carry a runtime-only `detailsPending` marker. `needsRemoteDetails` triggers the complete fetch for both single and batch selection independently of provenance. Partial search rows are not cached; complete fetched profiles are cached for offline use. Legacy Branded cache rows still request full details.
- Selecting a food pushes `serving-picker` with `origin=search` so search state stays mounted: Back returns to it, Log calls `router.dismiss(2)`.
- Multi-select collects several foods and opens `food-batch-review` to log them together. Its cards have an amount stepper and unit chips like the serving picker, and a sticky footer shows the total and the Log N foods button.
- A query or sort change scrolls results to the top; `hooks/useKeyboardHeight` pads lists on Android.

## Barcode scan

`app/barcode-scanner.tsx` is a full-screen camera scanner (native only, opened from the food search scan button). The camera chrome is always dark (dark theme tokens, light status bar): `components/barcode-scanner/Viewfinder.tsx` draws the mask, corner brackets and a scan line that stays still under Reduce Motion, and `ScanMissSheet.tsx` is the bottom sheet for not found, missing nutrition and network errors (edit the digits, create a food with the barcode, retry, scan again or search by name). It looks up via `lookupBarcode`, then replaces itself with `serving-picker`, or `custom-food` (prefilled, with the barcode) when not found.

- `lib/open-food-facts.ts` (`normalizeBarcode`, `mapOffProduct`, `buildServingUnits`, `fetchOffProduct`; never throws, 8 s timeout) maps Open Food Facts products to `Food` rows (`id: off:{barcode}`, `source: 'open_food_facts'`).
- Live barcode mapping and catalog import share an inclusive `0 < quantity <= 2000` g/ml serving cap and cleaned lowercase labels (USDA unit codes, bracketed notes, parentheses and stray punctuation). Fluid-ounce measures retain `fl oz`; mass-ounce measures are removed. Invalid or oversized servings use per-100g nutrition and `100g` units. Live mapping cannot use `_serving` fallback without a valid quantity, so missing per-100g energy makes oversized products incomplete. Shared fixtures in `test-utils/fixtures/off-serving-parity.json` verify both TypeScript and Python. Existing cached rows and historical logs are retained.
- `lookupBarcode()` in `lib/food-service.ts` checks SQLite, then OFF, and caches found products. Not-found results and errors are never cached.

## Nutrients

`lib/nutrients.ts` owns the ordered 30-item `NUTRIENTS` catalog, canonical g/mg/ug units (`ug` displays as µg), `NutrientId`, `NutrientValues`, `normalizeNutrients` and `scaleNutrients`.

- Food nutrients are flat nullable columns/properties per base serving: null is unknown, zero is known. There is no parallel JSON store.
- Vitamins A/E/folate keep RAE / alpha-tocopherol / total-folate definitions; ambiguous source definitions stay unknown.
- The bundled USDA asset (`assets/data/foods.db`) holds SR Legacy (7,793 foods, `usda_sr_legacy`) and Foundation Foods (259, April 2026 release, `usda_foundation`; duplicates of SR Legacy names and foods without calories are skipped). `scripts/build-food-db.mjs` builds it from the unzipped CSV folders in `SR_LEGACY_DIR` and `FOUNDATION_DIR`, and reuses the existing `fdc_id` to `id` mapping so ids referenced by food logs stay stable across rebuilds. Both sources behave identically in the app (`startsWith('usda')`). It supplies extended nutrients. OFF standardized mass fields convert grams once; the contributor `_unit` does not rescale those values.
- Joined date/range reads hydrate `FoodLogWithFood.food_nutrients` in one query. `sumNutrientTotals`, `slotNutrientTotals` and `sumEatenNutrientTotals` return per-id `{total, knownCount, missingCount}`; a null total means no known items. Scale by stored `serving_amount` exactly once, keep precision, exclude tombstones, and exclude planned slots from eaten day coverage. Coverage counts log items, including duplicates, and is independent of source accuracy.

## Custom foods

Custom-food entry has Food and Nutrition per serving cards (a macro-energy line shows when macros are entered) and one accordion per optional nutrient group (Other nutrients, Minerals, Vitamins; invalid fields stay visible under a collapsed group). It can be edited from the serving picker. `updateCustomFood` only edits custom rows; edits affect every historical log of that food.

- Local foods carry `synced_at`. `getUnsyncedCustomFoods` / `markCustomFoodsSynced` use snapshot guards and back up unlogged definitions before logs in the retrying sync pass. Owner changes reset custom markers.
- Restore paginates owned foods; `applyRemoteCustomFoods` applies definitions before resolving missing log foods, keeps pending local edits and ties, and accepts newer remote null clears.
- The `micronutrient_food_columns` SQL in `supabase/schema.sql` must be deployed before releasing clients that use it.

## Day detail

`app/day-detail.tsx` is the read-only summary of a past day, opened from Progress. Previous day and Next day buttons change the `date` param (Next is disabled on today and later). It shows the eaten calories against the goal, the macro bars, the meals with their food, and the day's finished workouts (`useDaySummary`, also when no food was logged). Over goal stays a full bar in the same color.

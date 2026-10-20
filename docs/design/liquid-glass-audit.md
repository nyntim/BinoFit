# Navigation and control material audit (#96)

Implemented against the landed #44 validation, #47 virtualized search, #95 nutrients and #94 meal summary. No persistence, routing, dependency or native configuration changes. The shared surface decorates existing controls; their handlers, keyboard behavior and disabled/busy gates remain in their owners.

## Final inventory

The treatment below is implemented; exclusions are deliberate. Native iOS tabs and accessory receive no wrapper or geometry changes. Meal summary now separates its compact Nutrition/Close navigation row from solid meal/date/status context.

| Area / file | Treatment |
| --- | --- |
| Native iOS 26 tab bar (`TabNavigator.ios.tsx`) | Preserve the native material, geometry, icon-only destinations/accessibility, selection and BottomAccessory. No new custom shell. |
| Fallback tab bar (`FloatingTabBar`, `TabBarSurface`) | Preserve existing shell geometry, shadow, keyboard handling and inset measurement; reuse its iOS material implementation for controls. Ensure shared extraction retains behavior. |
| Native active workout accessory (`ActiveWorkoutBar nativeAccessory`) | Preserve system surface; retain elapsed/rest text and tap-to-reopen. No second glass layer or duplicate accessory. |
| Fallback active workout bar (`FloatingTabBar` nonnative branch) | One shared neutral control surface around the existing banner, outside the tab shell. Allow the bar's inner background to be transparent only in this branch; keep its action and measured size. |
| Nutrition tab | One compact material group for Edit/settings, retaining the smaller Edit rectangle and text. Keep title/date, sync/streak row, calendar strip, food cards, quick-add drinks and #94 meal-summary triggers solid. |
| Nutrition edit mode (`EditModeBar`) | Single material toolbar for Cancel/Done; preserve errors, announcements, disabled states and overlay hit behavior over the week strip. |
| Training tab | Material around settings gear only; title, routines, week metrics, inline section actions and rows stay solid/plain. |
| Progress / More tabs | No new material on title-only headers, range chips, charts, records, settings rows or forms: these are content/data controls. Sheets opened here inherit their reusable toolbar treatment. |
| Food search | Material header/navigation and barcode action group; retain solid search input, spinner visibility, quantity hint and sort pills. Prefer separate solid input and compact scan action within the existing toolbar, without overlaying its text. Keep #47 FlatLists, row/footer ordering and restoration unchanged. |
| Exercise search (`workout/exercises`) | Single header group for Back/New exercise. Search input and muscle filters stay solid; no material on exercise result rows or create-food-like body suggestions. |
| Serving picker | Material Back/Cancel and Log/Save header group and keyboard Done accessory. Preserve #44 validity/busy states; amount field, nutrition, targets, detailed nutrient panels and unit-picker option rows stay solid. Unit picker has no separate navigation toolbar today, so its title/options remain solid rather than adding decorative glass or a new dismissal behavior. |
| Custom food | Material Cancel/Save header group; all #44 validation fields and #95 optional nutrient section stay solid. Preserve edit mode if #95 adds it. |
| Barcode scanner | Material header Cancel/torch controls, retaining explicit full-screen insets and camera permission/manual-lookup states. Keep camera preview, scan frame, manual entry and failure actions unchanged; no camera/routing rewrite. |
| Day detail | Material Back/header row only; selected date, charts and meal content remain solid. |
| Account and onboarding/account | Material Close/Back row with existing busy lock. AuthForm inputs, provider buttons, password/error states and content links remain solid. |
| Onboarding welcome/goals/complete | No new material: their actions belong to the static content flow, not navigation overlays; retain native Apple sign-in button and goal forms. Onboarding layout/root redirect routes have no candidate actions. |
| Workout session | One material header group for minimize/title/Finish, with existing explicit insets. RestBanner becomes one readable control surface for label/countdown and -15/+15/Skip, retaining normal layout flow. Do not add glass to sets, exercise blocks, meta inputs or footer discard action. |
| Workout log, finished workout, routine, history | Material header group for Cancel/Save or Back/More; preserve save/flush guards and exact handlers. Workout editor, routine rows/name field/start actions and history SectionList remain solid. |
| New-exercise builder | Material Cancel header in loaded and error/loading states, and one footer navigation group for Back/Next/Skip/Save. Keep steps/progress/inputs/review rows solid; saved-result Done is a body action and stays solid. |
| TabSettingsSheet | Material title/Done header, preserving `requestClose` flush-before-dismiss and reminder handoff. NutritionSection/TrainingSection and sheet body stay solid. |
| MealSettingsSheet | Material Cancel/Save footer toolbar and keyboard Done accessory only. Keep name/targets/reminder form, permission note and picker content solid. Preserve first-backdrop-tap keyboard dismissal. |
| Time/date picker | iOS custom Done toolbar uses material while native spinner stays solid; retain Done-only application of draft. Android system dialog remains native and untouched; default/web fallback stays functional and solid. |
| Workout OptionsSheet, SetTypeSheet, RestPickerSheet | Options and selected values stay solid. Apply one compact material to the shared Cancel action, benefiting all consumers; preserve iOS pending callback execution after dismissal. Never convert option rows or the entire long sheet to glass. |
| WeightEntrySheet / ExportDataSheet | Exclude from new material: present implementation is a solid form with embedded Save/Delete/Export actions and backdrop dismissal, no separate navigation toolbar. Keep native compact date picker and existing clear validation. Do not invent a toolbar solely for glass. |
| CalendarWidget | Material only on modal title/Close row. Week strip, month grid, month arrows, selection/data dots and legend stay solid; standalone MonthCalendar stays solid. |
| Dashboard quick-add overlays | Material Close row in QuickAddSearchModal and the existing Cancel/Add footer group in CustomWaterModal. Keep drink search, result list, fields and Confirm body action solid. No water validation scope expansion. |
| MealNutritionSummary (#94) | Material title/Close navigation row only in `components/dashboard/MealNutritionSummary.tsx`; meal title/context, totals, coverage captions and nutrient rows stay solid. No route or data changes. |
| Sync/streak pills, swipe delete, alerts, error banners, inline expanders | Preserve existing semantics and flat appearance. They are status/data/context actions rather than floating navigation; native alerts remain native. |


## Runtime and accessibility

`ControlSurface.ios.tsx` requires both `isLiquidGlassAvailable` and `isGlassEffectAPIAvailable`, catches runtime failures, starts opaque, ignores stale preference queries after a live preference event, cleans up its event subscription and fails closed on a rejected accessibility query. Native regular glass has no opaque tint/fill over it; older iOS uses the prior 45-intensity blur and navigation fallback fill. Reduce Transparency uses `navOpaque`; default/Android uses solid `navOpaque` without loading either native material module. App theme reaches native `colorScheme`. Decoration is touch-transparent and hidden from accessibility. Caller shapes and existing controls own layout. Native material is not interactive and has no new animation. Only the existing fallback tab shell retains a shadow.

## Verification

Automated integration checks: `npm run lint -- --no-cache` passes with zero errors and 14 existing warnings; `npx tsc --noEmit` passes; `npm test -- --runInBand` passes all 99 suites / 1,422 tests. Focused new tests cover both availability checks, rejected/initial/live accessibility preferences, stale preference resolution, theme forwarding, hidden untouchable decoration, full-opacity surface, disabled child action, solid default, shared tab shell geometry, fallback/native accessory modes, rest actions, OptionsSheet callback-on-dismiss, pending Finish and minimize flushing. Existing input validation, virtualized search, settings flush, dashboard summary and native-tab suites also pass. Jest cannot verify compositing or physical contrast.

Physical verification: **not performed**. No simulator, device or Expo process was started or stopped. Device model, OS and Expo Go version are unavailable. Native glass requires a supported iOS 26+ runtime and a compatible SDK 57 Expo Go client. The installed SDK 57 module is used; no SDK 58-only API or development client is required.

Outstanding on physical Expo Go:

- Light/dark and forced themes; Reduce Transparency toggled while open; Reduce Motion; large text; VoiceOver; contrast and clipping over scroll content for every candidate family.
- Nutrition Edit stays visually small with a 44pt hit region, independently of settings; sync/streak one row; edit error blocks Done; summary/date/scroll behavior.
- Search scan/cancel and keyboard; virtualized list scrolling/restoration; invalid food Save and optional nutrients; serving units and keyboard Done.
- Start/resume/minimize/reopen, exactly one native accessory with elapsed/rest detail; rest adjust/skip; pending Finish and finish/discard confirmations; builder/routine/history/log navigation.
- In-flight settings flush, reminders/permission denial, keyboard-first meal backdrop, picker draft Done/cancel, options dismissal callback, auth busy lock, barcode permission/manual states.
- Older iOS blur/opaque behavior and Android solid fallback, no module failures, keyboard avoidance and measured bottom clearance.

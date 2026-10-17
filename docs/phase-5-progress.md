# Phase 5: Progress

Plan for the Progress tab (issue #40). Read alongside `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md` and `docs/phase-4-training.md`, which owns the weight log, units and tombstones this plan builds on.

**UI must match the approved mockups in `docs/design/progress/`** (see its README for the screen-to-chunk map and how to read them). Every chunk with UI reads its mockups before planning, and design review checks against them.

## Product decisions

**Scope.** Calorie trend, macro averages, consistency (days logged, current and longest streak, month grid) and weight (log, chart, Apple Health import). Exercise records wait for Training data. Per-meal breakdown, water trend and goal history are out of scope.

**Tone.** PRODUCT.md and DESIGN.md win over the "motivating" wording in PRD_v2 section 6: neutral copy, no celebrations or badges, no red/green judgment colors.

**Ranges and charts**
- Hand-rolled SVG on the installed `react-native-svg`. No chart library.
- Range chips 7D / 30D / 90D / All, rolling and ending today, default 7D.
- Bucketing: 7D and 30D one bar per day; 90D one bar per week; All one bar per week up to about 26 weeks of history, one per month beyond.
- Weeks start Monday (matches `CalendarWidget` and the Training week line).
- Bars are neutral; the tapped bar is `tint`. A dashed line marks the current calorie goal (goals have no history).
- Macros: three `MacroBar`s, average grams against current goals.

**Counting rules**
- Trends count eaten logs only (`isSlotEaten`, same as `sumEatenTotals`). Planned logs are left out without a caption.
- A logged day is any log dated today or earlier, planned or eaten. Future planned days never count.
- Averages are over days with eaten logs, today excluded ("N logged days in the last 7 days, today excluded"). Today still draws as a bar.
- Streaks use the local date, never `toISOString()` (fixes the UTC bug in `getAllLoggedDates()` for the dashboard too).

**Weight**
- The weight log is Training C4: `weight_entries (id, date, weight_kg, measured_at, ...)`, latest `measured_at` per day wins, the latest entry writes `profile.weight`. This plan adds `source ('manual' | 'healthkit')` to that table and the chart.
- Stored in kg. **Displayed in lb by default**, kg selectable (`WEIGHT_UNIT`, Training C2; default changed to lb in `phase-4-training.md`).
- Synced, restored and wiped as Training C4 describes.
- Apple Health (iOS): read only, latest body-mass sample per day, imported on Progress focus. Never overwrites a day that has a `manual` entry. No writes to Health.
- Chart: entries as dots (manual filled, Apple Health hollow) plus a 7-day moving average line in `tint`. Neutral "Change over range" label, no goal weight.
- The weight sheet edits or deletes an existing entry; the delete confirmation is not mocked yet (use the standard destructive confirmation).

**Interaction and states**
- Tapping a daily bar or a past calendar day opens `day-detail` (switch it to `useFocusEffect`). Weekly and monthly bars only select.
- Sections always render; a range with no data shows neutral captions ("No average yet", "The chart starts at 2 entries."). One plain full-screen message only if nothing was ever logged.

**Settings**
- Weight unit must be reachable in every tracking mode, including nutrition only. The mockup puts it under Preferences; if Training C2/C3 already put Units in `TrainingSection`, make sure that section (or at least Units) stays visible when training is hidden.
- New Apple Health row "Read weight" next to the existing nutrition row.
- Personal Stats weight shows the chosen unit; saving it logs today's entry (Training C4 behavior).

## Code structure

Computation lives in pure, unit-tested modules; hooks only fetch.

- `lib/progress.ts`: `ProgressRange`, `rangeBounds(range, today)`, `enumerateDates`, `buildDailyTotals(logs, confirmations, start, end)`, `summarize(daily, today)`, `bucket(daily, 'day' | 'week' | 'month', weekStartsOn = 1)`, `bucketFor(range, historyDays)`, `chartScale(values, goal)`.
- `lib/streak.ts`: `computeStreaks(dates, today)`, moved out of `hooks/useStreak.ts`.
- `lib/weight-chart.ts`: `movingAverage(entries, days = 7)`, `changeOverRange`, `latestPerDay`, `mergeHealthSamples(manual, samples)`. Unit conversion stays in `lib/units.ts` (Training C2).
- `hooks/useProgress.ts`: `useFocusEffect` loading `getFoodLogsWithFoodInRange`, `getMealSlotConfirmationsInRange`, goals and logged dates.
- `components/progress/`: `RangeChips`, `CalorieTrendChart`, `AveragesCard`, `ConsistencyCard`, `WeightChart`; Training C4's `WeightCard` and `WeightEntrySheet` grow into the mocked versions.
- `components/month-calendar.tsx`: `weekStartsOn` prop, theme color instead of hardcoded `'#fff'`, future days disabled.

## Build order

1. **P1 Trends and consistency.** No dependencies, no schema change. Mockups: `Main`, `Light30`, `Light90`, `LightAll`, dark variants, `Sparse`, `FirstRun`. If Training C1 has landed, every new read filters tombstones; if not, C1 must cover the new queries.
2. **P2 Weight on Progress.** After Training C1, C2, C4. Adds `source` to `weight_entries` (in C4 if not yet built, else a migration plus `supabase/schema.sql` change), `WeightChart`, recent entries, edit and delete, unit display. Mockups: weight card in `Main`, `WeightSheet`, `WeightEdit`, `SettingsUnits`.
3. **P3 Apple Health weight import (iOS).** After P2. Weight read permission and `fetchWeightSamples(start)` in `hooks/use-health-kit.ts` (check the unit option in the patched react-native-health), import on Progress focus, Settings "Read weight" row. Mockup: `SettingsUnits`.
4. **CLAUDE.md update**, folded into each chunk.

## Tests
- P1: range bounds across month and year ends; every date present, empty ones included; planned excluded and no-confirmation counted as eaten; deleted-meal logs still counted; averages exclude today and empty days; Monday week buckets; All switches to months past 26 weeks; `computeStreaks` with today unlogged, gaps, future dates, single date, empty list; local-date boundary.
- P2: moving average window; change over range; latest per day; lb display round trip; edit and delete keep `profile.weight` equal to the latest entry.
- P3: manual day never overwritten; one sample per day; HealthKit unavailable or denied is a no-op; web and Android no-op.

## Risks
- The streak date fix can change some users' dashboard streak number.
- Existing users' stored weight will show in lb.
- Trend totals use an INNER JOIN on `foods`; a log whose food row is missing drops out (same as the dashboard).
- `supabase/schema.sql` changes (Training C4, plus `source`) must be applied before builds that sync them ship.

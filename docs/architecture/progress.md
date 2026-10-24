# Progress tab

Decisions: ADRs 0009, 0012 and 0013 in `docs/decisions/`. Historical mockups: `docs/design/progress/`. Components live in `components/progress/`.

## Nutrition data

- `lib/progress.ts` (pure, `today` passed in): `rangeBounds`, `enumerateDates`, `buildDailyTotals` (eaten logs only via `isSlotEaten`; `anyLogs` also counts planned), `summarize` (averages skip today and empty days), `bucket` (Monday weeks), `bucketFor` (All: weeks up to 182 days, then months), `bucketSpine`, `chartScale`.
- `hooks/useProgress(range)` loads in `useFocusEffect`.
- UI: `RangeChips`, `CalorieTrendChart`, `AveragesCard`, `ConsistencyCard`, plus the weight card ([weight.md](weight.md)). Daily bars and past calendar days push `/day-detail`, which reloads on focus.
- `MonthCalendar` (`components/month-calendar.tsx`) takes `today`, `weekStartsOn` and theme colors, and disables future days.

## Streaks

`lib/streak.ts` `computeStreaks(dates, today)` feeds `useStreak` with the local date (`getAllLoggedDates(today)` uses the local date, not UTC).

## Calorie chart weight overlay

The Weight toggle (default off) draws `trendWeights` on a right axis via `lib/calorie-weight.ts` (`alignTrendToBuckets` samples the trend at `bucket.end`, `weightDomain` does not include 0, `weightY`, `trendSegments`). The rate caption is `weeklyRate`, using the same full `getLiveWeightDays` series as the weight card.

## Expenditure

`components/progress/ExpenditureCard.tsx` (`hooks/useExpenditure.ts`) is independent of the range chips. `estimateExpenditure` in `lib/expenditure.ts` uses the 21 days ending yesterday, eaten logs via `buildDailyTotals`, `trendWeights`, 7700 kcal/kg, and the 14-day / 4-weigh-in gate. It does not change goals.

## Training on Progress

`lib/workouts/progress.ts`, `components/progress/WorkoutsChart.tsx`, `components/progress/RecentRecordsCard.tsx`.

- `trainingBuckets`, `trainingAverages`, `formatSessionsPerWeek`, `sessionBarScale` and `recentRecords` share the range chips and `bucketFor` (All starts at the earliest done workout via `getDoneWorkoutDates`).
- `WorkoutsChart` toggles Sessions (`sessionBarScale`) and Volume (`chartScale`), and shows sessions per 7 days (1-week floor) and mean duration with today included.
- `ConsistencyCard` and `MonthCalendar` add a second `text` dot for `trainedDates` and a Logged/Trained legend (no training streak).
- `RecentRecordsCard` shows up to 5 still-standing records derived via `lib/workouts/records.ts` and opens `/workout/[id]`. It must not read a stored records table.

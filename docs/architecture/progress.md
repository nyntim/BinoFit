# Progress tab

Decisions: ADRs 0009, 0012 and 0013 in `docs/decisions/`. Historical mockups: `docs/design/progress/`. Components live in `components/progress/`.

## Nutrition data

- `lib/progress.ts` (pure, `today` passed in): `rangeBounds`, `enumerateDates`, `buildDailyTotals` (eaten logs only via `isSlotEaten`; `anyLogs` also counts planned), `summarize` (averages skip today and empty days), `bucket` (Monday weeks), `bucketFor` (All: weeks up to 182 days, then months), `bucketSpine`, `chartScale`.
- `hooks/useProgress(range)` loads in `useFocusEffect`.
- UI, top to bottom under a `largeTitle` "Progress": `RangeChips` (a `SegmentedControl`), `CalorieTrendChart`, `AveragesCard`, `ConsistencyCard`, `ExpenditureCard`, the weight card ([weight.md](weight.md)), `WorkoutsChart`, `RecentRecordsCard`. Each is a `Card` with a shared `ProgressCardHeader` (label, headline number, caption, optional control). Daily bars and past calendar days push `/day-detail`, which reloads on focus.
- First run (`nothingEver`): an `EmptyState` card "Your trends start here" with Log food (`homeRouteFor()`) and Start a workout (`/workout/session`), over a faded decorative placeholder card hidden from accessibility.
- Calories chart: bars use `chartBar` (selected `tint`, today at half opacity, empty buckets 3 px stubs), the goal is a dashed line with a "Goal 2,250" label, and a text summary describes the chart. The axis shows per-bar labels for 7D and months, otherwise the start date and Today.
- `MonthCalendar` (`components/month-calendar.tsx`) takes `today`, `weekStartsOn` and theme colors, and disables future days.

## Streaks

`lib/streak.ts` `computeStreaks(dates, today)` feeds `useStreak` with the local date (`getAllLoggedDates(today)` uses the local date, not UTC). `currentStreakDates(dates, today)` returns the run behind the current streak; both share one helper so they cannot drift.

## Calorie chart weight overlay

The "+ Weight" chip (default off, a checkbox chip labelled "Show weight trend") draws `trendWeights` on a right axis via `lib/calorie-weight.ts` (`alignTrendToBuckets` samples the trend at `bucket.end`, `weightDomain` does not include 0, `weightY`, `trendSegments`). The rate caption is `weeklyRate`, using the same full `getLiveWeightDays` series as the weight card.

## Expenditure

`components/progress/ExpenditureCard.tsx` (`hooks/useExpenditure.ts`) is independent of the range chips. `estimateExpenditure` in `lib/expenditure.ts` uses the 21 days ending yesterday, eaten logs via `buildDailyTotals`, `trendWeights`, 7700 kcal/kg, and the 14-day / 4-weigh-in gate. It does not change goals.

## Training on Progress

`lib/workouts/progress.ts`, `components/progress/WorkoutsChart.tsx`, `components/progress/RecentRecordsCard.tsx`.

- `trainingBuckets`, `trainingAverages`, `formatSessionsPerWeek`, `sessionBarScale` and `recentRecords` share the range chips and `bucketFor` (All starts at the earliest done workout via `getDoneWorkoutDates`).
- `WorkoutsChart` switches Sessions (`sessionBarScale`) and Volume (`chartScale`) with a `SegmentedControl` labelled "Training metric", and shows sessions a week (1-week floor) and mean session duration with today included, plus a chart text summary.
- `ConsistencyCard` has three tiles (Current streak in ember, Longest, Logged), a day grid of the last 90 days at most (`consistencyDays` in `lib/progress.ts`; current streak days `ember`, other logged days `tint`, today outlined; one image element with a text summary, not tappable), and below it the unchanged `MonthCalendar` with month browsing, past-day taps to `/day-detail`, and a second `text` dot for `trainedDates` with a Logged/Trained legend (no training streak).
- `RecentRecordsCard` shows up to 5 still-standing records derived via `lib/workouts/records.ts` and opens `/workout/[id]`. It must not read a stored records table.

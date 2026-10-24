# Progress guide

Canvas page: **Progress**. Board sources: `boards/Prg*.dc.html`. Read [foundations.md](foundations.md) first. Behavior reference: `docs/architecture/progress.md`, `docs/architecture/weight.md`, ADRs [0009](../../decisions/0009-weight-log.md), [0012](../../decisions/0012-progress-charts.md), [0013](../../decisions/0013-progress-counting-rules.md).

Rules that do not change: computation stays in pure modules (`lib/progress.ts`, `lib/streak.ts`, `lib/weight-chart.ts`, `lib/workouts/progress.ts`, `lib/calorie-weight.ts`); hooks only fetch; hand-rolled SVG charts; weeks start Monday; averages exclude today.

## PrgMain: Progress (full scroll)

- **Route:** `app/(tabs)/progress.tsx` (`useProgress`, `RangeChips`, `CalorieTrendChart`, `AveragesCard`, `ConsistencyCard`, `ExpenditureCard`, `WeightCard`, `WeightChart`, `WorkoutsChart`, `RecentRecordsCard`).
- **Layout, top to bottom:**
  1. `largeTitle` "Progress".
  2. Range `SegmentedControl` 7D / 30D / 90D / All (replaces `RangeChips` look; same values).
  3. Calories card: "Calories, daily average" with `hero`-sized average; "+ Weight" chip toggles the existing weight overlay; bars in `chartBar`, the selected bar `tint`, today at 50% opacity, empty days as 3 px stubs at 35%; dashed goal line with "Goal 2,250" label; axis start and "Today"; caption "26 logged days in the last 30, today excluded".
  4. Macros card: three `ProgressBar`s of average vs goal.
  5. Consistency card: three tiles (Current streak on `emberSoft` with `ember` text, Longest, Logged N/M); a grid of day squares (logged `tint`, current streak days `ember`, missed `cardSecondary`, today outlined).
  6. **Expenditure card:** not drawn on the board; keep `ExpenditureCard` and style it like the Calories card header (label plus `stat` number plus caption).
  7. Weight card: "Weight trend" with current trend value and unit, neutral change chip ("−2.1 lb in 30 days", never colored); dots (logged filled, Apple Health hollow) and the trend line in `tint`; legend; Log weight (`soft`, opens `WeightEntrySheet`).
  8. Training card: Sessions / Volume `SegmentedControl`; two stats (sessions a week, average session); weekly bars, current week `tint`.
  9. Recent records card: rows with `ember` star, exercise, record kind and date, value.
  10. Tab bar.
- **Interaction:** tapping a daily bar opens `/day-detail` (existing); weekly and monthly bars only select. Chart wrappers carry text summaries for screen readers.
- **Sparse data:** sections always render with neutral captions ("No average yet", "The chart starts at 2 entries.").

## PrgEmpty: Nothing logged yet

- **Route:** the full-screen message `progress.tsx` shows when nothing was ever logged.
- **Layout:** `largeTitle`; `EmptyState` card (dinosaur, "Your trends start here", "Log a few days of food or a workout and this page fills in. Weekly patterns show after 7 days.", Log food primary, Start a workout secondary); a faded placeholder chart card ("No average yet", hidden from accessibility).

## PrgWeightSheet: Log weight

- **Component:** `components/progress/WeightEntrySheet.tsx`.
- **Layout:** sheet; Cancel / "Log weight" / Save; large centered value (`hero` 60) with −0.1 / +0.1 round buttons (accessible labels) and unit below; "Last entry 172.8 lb on Wed 21 Oct"; Date and Time rows (pickers); `tintSoft` notice with heart: "Apple Health readings import on their own. A weight you log here wins for that day." (iOS only; hide on Android).
- **Behavior:** unchanged (kg storage, latest entry writes `profile.weight`, manual wins over Health for the day).
- **New:** the ±0.1 buttons and "last entry" line (simple).

## PrgWeightEdit: Edit weight entry

- **Component:** the edit mode of `WeightEntrySheet` opened from a weight entry (entries list on the weight card or a weight entries screen).
- **Layout:** behind the sheet, the entries list (date, source Logged / Apple Health, value with unit); sheet: Cancel / date / Save, large editable value with tint underline and "unit · logged at time", Delete entry (`danger` on `dangerSoft`), caption "Your profile weight follows the latest entry." Board is in dark mode to show the dark sheet.
- **Behavior:** delete uses the standard destructive confirmation and tombstones (`lib/tombstones.ts`).

# Weight log

`lib/weight.ts`: SQLite `weight_entries` (created by `initWeightSchema` from `initSchema`; tombstoned like food logs and allow-listed in `lib/tombstones.ts`). Weight is always stored in kg; display goes through `lib/units.ts`.

## Writes

The UI keeps one entry per day.

- `saveWeightEntry({date?, weight_kg})` updates the day's latest live row or inserts one (`measured_at` is now for today, local noon for a backdated day; range 20 to 400 kg). `weightInputToKg` / `weightRangeMessage` validate display input.
- `deleteWeightEntriesForDate` tombstones the whole day.
- Call `syncToSupabase()` after every write.

## Reads

- `getLatestWeightEntry`, `getWeightOnOrBefore(date)`, `getRecentWeightDays(n)`, `getLiveWeightDays()` (live rows, one per day) all exclude tombstones. `getUnsyncedWeightEntries` includes them.
- The latest entry is canonical: `syncProfileWeightFromLatest()` writes `profile.weight` only when it differs. A backdated entry never changes it; with no entries left the profile is untouched.
- Pure helpers: `collapseLatestPerDay`, `pickLatest`, `resolveBodyweightKg(entry, profile)` (entry, else profile.weight, else null).

## Sync and restore

`syncWeightEntries` and restore (`applyRemoteWeightEntries`, run after the profile; counted in `RestoreSummary.weightEntriesRestored`) follow the tombstone rules in [data-and-sync.md](data-and-sync.md). Wipe deletes the table.

## Trend

`lib/weight-trend.ts`: `trendWeights` (14-day EWMA, decay by days elapsed, full history) and `weeklyRate` (kg/week, null until 4 weigh-ins span 10+ days).

## UI

- Progress tab: `components/progress/WeightCard.tsx` + `WeightEntrySheet.tsx` (`hooks/useWeightEntries.ts`). The card draws raw dots and the trend for the selected range and shows the current trend and rate as neutral text.
- Settings weight field and the onboarding goals weight field.
- Calorie chart weight overlay and expenditure estimate: see [progress.md](progress.md).

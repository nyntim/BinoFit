# 0008. How training volume is counted

- **Status:** Accepted
- **Date:** 2026-10-17
- **Links:** `docs/architecture/training.md`, `docs/architecture/progress.md`

## Context
Volume appears on the Training tab, in records and in Progress charts. If each screen counted it differently, the numbers would disagree.

## Decision
- Volume counts `weight_reps` sets only, excluding warmups.
- `bodyweight_reps` counts added load only.
- Per-side exercises count both sides.
- On plate-loaded machines, logged weight is the plates added; the sled's starting weight is shown for reference and not counted.
- Weeks start on Monday everywhere (Training week line, Progress buckets, calendars).

## Alternatives considered
- Counting bodyweight as load: inflates volume for bodyweight work and needs an accurate bodyweight for every date.
- Locale-dependent week start: matches some users' calendars, but makes weekly numbers inconsistent across screens.

## Consequences
- One shared implementation in `lib/workouts/`; screens never compute volume themselves.

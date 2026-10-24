# 0013. What Progress counts

- **Status:** Accepted
- **Date:** 2026-10-17
- **Links:** `lib/progress.ts`, `lib/streak.ts`, `docs/architecture/progress.md`

## Context
Food can be logged as planned or eaten, and today is never finished. Without clear rules, averages and streaks would mislead.

## Decision
- Trends count eaten logs only. Planned food is left out.
- A logged day is any day up to today with a log, planned or eaten. Future planned days never count.
- Averages cover days with eaten logs, today excluded, and say so ("N logged days in the last 7 days, today excluded"). Today still draws as a bar.
- Streaks use the local date, never UTC.
- Sections always render; a range with no data shows a short caption instead of disappearing.

## Alternatives considered
- Include today in averages: the number would swing all day and look like underreporting every morning.
- Count planned food: makes plans look like results.

## Consequences
- Captions explain the rule where it affects a number; designs should leave room for them.

# 0009. The latest weight entry is canonical

- **Status:** Accepted
- **Date:** 2026-10-17
- **Links:** `docs/architecture/weight.md`, `docs/architecture/integrations.md`

## Context
Body weight was a single profile field. Progress needs a history, Apple Health can supply readings, and calculations (expenditure, bodyweight exercises) need a weight for a given date.

## Decision
- Weight is a log (`weight_entries`), stored in kg. The latest `measured_at` per day wins.
- The latest entry writes `profile.weight`; the Settings weight field shows it, and saving that field logs today's entry.
- Apple Health is read on iOS. A manual entry is never replaced by a Health reading for the same day.
- Charts show entries plus a smoothed trend line, with a neutral "change over range" label and no goal weight.

## Alternatives considered
- Keep a single profile weight: no history, no trend.
- Let Health overwrite manual entries: fewer duplicates, but surprises people who corrected a reading.

## Consequences
- Weight is presented as information, never as a target or a verdict (see 0015).

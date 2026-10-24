# 0003. Store metric, display in the user's unit

- **Status:** Accepted
- **Date:** 2026-10-17
- **Links:** `docs/architecture/preferences.md`, `lib/units.ts`

## Context
Weight, height and distance appear in nutrition, training and progress. Storing them in whichever unit the user typed would make every calculation and sync conversion a source of drift.

## Decision
Weight is stored in kg, distance in metres, time in seconds. Display follows one Metric or Imperial preference: kg with km, lb with mi. Fresh installs default to Imperial; saved preferences are kept. Conversion happens only for display and input, through `lib/units.ts`.

## Alternatives considered
- Separate weight and distance unit settings: more flexible, but rarely wanted and easy to leave in odd combinations.
- Storing the entered unit: avoids rounding on display, but complicates every sum and chart.

## Consequences
- Round trips must not drift (covered by unit tests).
- Designs show values in one unit system at a time; mockups may use either.

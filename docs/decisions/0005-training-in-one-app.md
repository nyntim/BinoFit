# 0005. Training is a module of the same app

- **Status:** Accepted
- **Date:** 2026-10-17
- **Links:** `docs/architecture/training.md`, `docs/design/training/`

## Context
Many users who track food also lift. A second app would split their data and their habit. Training also has very different screens (live sessions, set tables, timers) from nutrition.

## Decision
Training lives in BinoFit as its own tab, built as a self-contained module (`lib/workouts/`, `components/workouts/`, `app/workout/`). Its link to nutrition is narrow: exercise burn feeds expenditure, and Progress reads both.

In scope: strength and cardio (cardio by manual entry: duration, optional distance, computed pace), live sessions and logging afterward, set types (normal, warmup, drop, failure), optional effort (RPE or RIR), routines, records and weekly volume targets.

Out of scope for now: programs and auto-progression, GPS, Apple Watch, social, body measurements and photos, exercise videos, gym or location tagging.

## Alternatives considered
- A separate training app: cleaner product story, but splits data and doubles the work.
- Training tightly woven into the nutrition dashboard: one screen, but cramped and confusing for nutrition-only users.

## Consequences
- The product is no longer "a nutrition tracker"; product and design docs cover both (see 0015, 0016).
- Training is native only; there is no web version.

# 0007. Small built-in library, guided exercise builder

- **Status:** Accepted
- **Date:** 2026-10-17
- **Links:** `lib/workouts/exercise-seed.ts`, `docs/design/training/Builder.dc.html`, `docs/references/competitor/`

## Context
Large exercise databases are noisy and still miss the machine at your gym. What people actually need is the common movements plus a quick way to add their own.

## Decision
- Ship a small hand-curated list of unbranded movements (46 at launch, grouped by chest, back, shoulders, arms, legs, core and cardio). Each seed has a stable slug id, log type, muscles, equipment, default rest and a MET value. Seeds never sync and are retired with `hidden = 1`, never deleted. free-exercise-db was used only as a reference for names and muscle mapping; none of its text or images are imported.
- Custom exercises come from a guided builder: one question per screen (equipment, brand, loading, name, muscles, how you log it, setup notes), ending on a review card where each line taps back to its step. It opens from the session picker, the library, and "Create '<query>'" on an empty search.
- Setup notes ("Seat 4, back pad 2") show under the exercise name in every session.

## Alternatives considered
- Import a large open database: broad coverage, poor quality and licensing questions.
- One flat create form (what the competitor in `docs/references/competitor/` does): faster for experts, but easy to skip the fields that make logging and volume correct.

## Consequences
- Deleting a custom exercise tombstones it; past workouts keep its name.
- The builder's step-by-step shape is a decision; its visual design is open.

# 0002. Meals are user-defined

- **Status:** Accepted
- **Date:** 2026-04-17, revised 2026-10-18

## Context
The first plan had fixed Breakfast, Lunch, Dinner and Snack slots. People eat on different schedules (two meals, five meals, shift work), and fixed names made the log feel wrong for many of them.

## Decision
New installs start with four meals named Meal 1 to Meal 4. Users rename, add and remove meals. Internal ids (`breakfast`, `lunch`, `dinner`, `snack` for the originals) stay stable when labels change, and existing saved names are never rewritten.

## Alternatives considered
- Fixed slots: simplest, but wrong for many users.
- Untimed log with no meals: fastest, but loses the grouping people use to remember what they ate.

## Consequences
- UI resolves names through `nameForDate` / `mealsForDay`; slot labels are never hardcoded.
- Designs should show meals as a variable-length list, not four fixed cards.

# Phase 2 — Meal Logging & Daily Dashboard

**Scope:** Core loop — search food → log it → see progress toward daily goals

**Depends on:** Phase 1 (SQLite schema + food database live)

---

## Goals
Deliver the core user loop. A user can open the app, log a meal, and see their day's progress. This is the minimum to validate the product.

## Features

### Food Search
- Text search across food names with fast local SQLite lookup
- Results show name, serving size, and key nutrition (calories, protein, carbs, fat)
- Select a food → set serving amount → confirm

### Meal Logging
- Four meal slots: Breakfast, Lunch, Dinner, Snacks
- Add food to a slot (via search)
- Adjust serving size before saving
- Edit or delete a logged item
- "Recent foods" list (last N logged)
- "Frequent foods" list (most-logged foods)

### Daily Dashboard (Home Screen)
- Calories consumed vs. goal — primary visual (ring or bar)
- Macro breakdown: protein / carbs / fat with progress bars or rings
- Meals logged for the day, grouped by slot
- Quick-add button always accessible (floating or sticky)
- Defaults to today; tapping a meal slot opens logging flow

## UX Principles (from PRD)
- Log a meal in under 15 seconds
- Never more than 3 taps + search to log
- Dashboard feels rewarding, not shaming

## Done When
- User can search food, set serving size, and save a log entry
- Logged items appear on the dashboard under the correct meal slot
- Calories and macros update in real time after logging
- Edit and delete work correctly
- Recent and frequent foods surface after a few logs

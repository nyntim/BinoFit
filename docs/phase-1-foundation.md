# Phase 1 — Foundation & Data Layer

**Scope:** Local storage setup, data models, onboarding, food database, settings

---

## Goals
Get the app runnable with real data. No UI polish yet — just working plumbing and a user who has set their goals.

## Features

### Onboarding (3 screens)
- Welcome screen
- Set calorie + macro goals (optional: weight, height, activity level for auto-suggestion)
- Done / home redirect
- All data persisted locally; no account required

### Local Storage Setup
- Expo SQLite for structured data (foods + logs)
- AsyncStorage for settings/goals
- Schema uses UUIDs + `updated_at` from day one (future Supabase migration is additive)

### Data Models (SQLite)

**`foods`**
- `id` (UUID), `name`, `brand`, `serving_units`, `calories`, `protein`, `carbs`, `fat`, `source` (USDA id)

**`food_logs`**
- `id` (UUID), `date`, `meal_slot`, `food_id`, `serving_amount`, `serving_unit`, `created_at`, `updated_at`

**`user_goals`**
- `calorie_goal`, `protein_goal`, `carb_goal`, `fat_goal`, `updated_at`

**`user_profile`**
- `weight`, `height`, `activity_level`, `updated_at`

### Food Database
- Curate USDA FoodData Central subset (~5–10k most common foods)
- Bundle with app or fetch-on-first-launch (decision TBD)
- Per-serving nutrition: calories, protein, carbs, fat
- Common serving sizes: grams, cups, pieces

### Settings Screen
- Update daily calorie and macro goals
- Update personal stats (weight, height, activity level)
- View app info / version

## Done When
- SQLite schema is migrated and seeded with food data
- Onboarding flow completes and persists goals
- Settings screen reads and writes goals correctly
- Food search query returns results with correct nutrition data

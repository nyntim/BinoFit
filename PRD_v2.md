# Product Requirements Document (PRD)
## Fitness & Nutrition Tracking App — Full Production Release

---

**Document status:** Draft v2.0
**Owner:** Tim
**Last updated:** May 7, 2026
**Scope:** Full production app (all platforms)

> **Note:** This document supersedes the v1.0 MVP PRD. The project is no longer scoped as an MVP prototype. This is a production app being built for deployment on iOS, Android, and web (PWA).

---

## 1. Overview

### 1.1 Product summary

A polished, production-grade fitness and nutrition tracking app that lets users log meals, track macros and calories against personal goals, and build sustainable awareness of their eating habits. Comparable in feature scope to MyFitnessPal, but with a significantly cleaner UX, no ads, and a faster, more focused core experience.

The app targets all three major platforms from a single React Native + Expo codebase: iOS, Android, and web (PWA).

### 1.2 Problem statement

Existing nutrition trackers are bloated, ad-heavy, or paywalled. Users who want a modern, fast, and honest tool for understanding what they eat lack a strong alternative. This app fills that gap with a design-first, no-dark-patterns approach.

### 1.3 Goals

- Ship a complete, production-quality app across iOS, Android, and web.
- Deliver the full core loop with accounts, cloud sync, and real user data persistence.
- Build a clean, scalable architecture on Supabase + Postgres from the start.
- Offer a user experience that is meaningfully better than incumbents on speed, clarity, and design polish.

### 1.4 Non-goals (explicit scope exclusions)

- Social features, friends, sharing, or community feeds
- AI-generated meal recommendations or macro coaching
- Integration with wearables or fitness hardware
- In-app purchases or premium tiers (deferred)
- Branded food partnerships or sponsored content

---

## 2. Target user

**Primary persona:** The Consistent Tracker

A health-conscious adult (22-40) who wants a reliable, fast tool for understanding what they eat. They may have used MyFitnessPal or Cronometer before, but found them cluttered or slow. They are motivated by progress visibility, not gamification. They log consistently when the tool stays out of their way.

**Key user needs:**

- Log a meal in under 15 seconds
- Trust that nutrition data is accurate (USDA-backed)
- Have their data available across all their devices
- See at a glance whether they are on track for the day
- Not be shown ads, upsells, or dark patterns

---

## 3. Core user flows

### 3.1 Onboarding and account creation

First launch → welcome screen → sign up (email or OAuth) → set goals (calories + macros) → optional stats input (weight, height, activity level for goal suggestion) → home screen

### 3.2 Meal logging

Tap meal slot (breakfast / lunch / dinner / snacks) → search food → select result → set serving size → confirm → return to dashboard with updated totals

### 3.3 Daily dashboard

Home screen shows: calories consumed vs. goal, macro breakdown (protein / carbs / fat), and all logged meals for the day grouped by slot. Quick-add button always accessible.

### 3.4 History

Calendar or scrollable day navigation to review any past day. Each past day shows the full dashboard summary (totals, macros, meals logged).

### 3.5 Barcode scanning

From food search: tap barcode icon → camera opens → scan label → food entry pre-populated with product data → confirm serving size → log.

### 3.6 Custom food creation

From food search: tap "Create food" → enter name, serving size, and nutrition facts → save → available in search and recent foods immediately.

### 3.7 Exercise logging

Navigate to exercise tab → search exercise or browse by category → log sets/reps (strength) or duration/distance (cardio) → calories burned reflected in daily totals.

### 3.8 Settings and goal management

Settings → update calorie and macro targets → update personal stats → manage account → notification preferences → data export.

---

## 4. Feature requirements

### 4.1 Authentication and accounts

- Email + password sign up and login via Supabase Auth
- OAuth providers: Google, Apple (required for App Store)
- Password reset via email
- Account deletion with data wipe
- Session persistence across app launches
- Anonymous device session as a fallback for non-authenticated browsing (not a long-term state -- prompt to create account after first log)

### 4.2 Food database and search

- Primary data source: USDA FoodData Central
- Bundled compressed core index (~5,000-10,000 most common foods) for offline search
- Remote fallback search via Supabase for less common items
- Results cached locally after remote fetch
- Per-serving nutrition display: calories, protein, carbs, fat (minimum); fiber, sugar, sodium (extended)
- Support for common serving units: grams, oz, cups, pieces, ml
- Search ranking: exact matches first, then fuzzy, then brand/packaged foods

### 4.3 Meal logging

- Four meal slots: breakfast, lunch, dinner, snacks
- Add food to a slot via search or barcode scan
- Adjust serving size before and after saving
- Edit or delete any logged item
- Quick-log from recent foods (last 20 logged)
- Quick-log from frequent foods (most logged by count)
- Copy a meal slot from a previous day
- Log multiple foods at once (multi-select from search)

### 4.4 Barcode scanning

- Camera-based barcode scanner via `expo-barcode-scanner`
- Lookup flow: scan -> check local cache -> check Supabase -> fall back to Open Food Facts API
- Cache successful lookups locally for offline re-use
- Handle scan failures gracefully (manual entry fallback)

### 4.5 Custom food entry

- Create a food with: name, brand (optional), serving size, calories, protein, carbs, fat
- Optional extended fields: fiber, sugar, sodium, saturated fat
- Stored in Supabase under the user's account
- Synced across devices
- Custom foods appear in search results alongside USDA data

### 4.6 Exercise logging

- Two exercise types: strength (sets x reps x weight) and cardio (duration + distance or duration only)
- Exercise database: common exercises by category (push, pull, legs, cardio, etc.)
- Log calories burned (estimated from MET values for cardio; strength tracking is reps/sets without calorie burn for v1)
- Daily calories remaining adjusts based on exercise burn
- History view shows exercise logs alongside food logs

### 4.7 Daily dashboard (home screen)

- Calories consumed vs. goal as the primary visual (ring or large bar)
- Calories burned from exercise subtracted from daily balance
- Macro breakdown (protein / carbs / fat) with progress bars or rings
- All meals logged for the day, grouped by slot
- Quick-add button always accessible (floating action or sticky bottom bar)
- Streak indicator for consecutive logging days

### 4.8 History

- Calendar view with logged days visually marked
- Navigate to any past day to see full dashboard summary
- Weekly summary view (average calories, macro averages, streak)
- History is read-only; editing is only available on today's view

### 4.9 Progress and analytics

- Weight tracking: log current weight with date; chart over time
- Trend lines: 7-day and 30-day calorie and macro averages
- Streak tracking: current and longest consecutive logging streak
- Personal records for exercise (max weight per exercise)

### 4.10 Notifications and reminders

- Daily logging reminder (configurable time, off by default)
- Meal reminder (configurable per slot, off by default)
- Streak protection reminder (fires if no log by evening)
- All notifications opt-in; no defaults

### 4.11 Settings

- Edit calorie and macro goals
- Edit personal stats (weight, height, activity level)
- Account management (email, password, OAuth connections)
- Notification preferences
- Theme: light / dark / system
- Data export: CSV of all food logs and exercise logs
- Account deletion

### 4.12 Water tracking

- Daily water intake log (glasses or ml)
- Goal setting (daily target)
- Quick-add buttons on dashboard (1 glass, custom amount)
- Visual progress indicator on dashboard (secondary to calories)

---

## 5. Technical approach

### 5.1 Stack

| Layer | Technology |
|---|---|
| Frontend | React Native + Expo (single codebase) |
| Web output | React Native Web via Expo (PWA) |
| Native builds | EAS (Expo Application Services) |
| Backend | Supabase |
| Database | Postgres (via Supabase) |
| Auth | Supabase Auth (email + Google + Apple) |
| Local storage | expo-sqlite (structured data), AsyncStorage (settings/preferences) |
| Food data | USDA FoodData Central + Open Food Facts (barcode fallback) |
| Analytics | PostHog or Supabase-integrated event tracking |
| Crash reporting | Sentry (`@sentry/react-native`) |

### 5.2 Key architectural decisions

**Supabase as primary backend from day one.** All user data (food logs, exercise logs, goals, custom foods, weight entries) lives in Postgres via Supabase. Local SQLite serves as a cache and offline layer, not the source of truth.

**Local-first with cloud sync.** Core flows work offline. Data syncs to Supabase when network is available. Conflict resolution: last-write-wins on `updated_at`.

**Single codebase, three platforms.** React Native Web via Expo compiles to a PWA. iOS and Android are built via EAS. No separate web codebase.

**Authentication required for data persistence.** Users must be signed in for their data to sync. Anonymous sessions are tolerated briefly (first session), then a soft prompt to create an account is shown. Data created anonymously is claimable on sign-up.

**Bundled food index for fast offline search.** A compressed subset of USDA foods is bundled with the app (~5 MB). Extended searches fall back to Supabase. Results are cached locally.

**UUIDs and `updated_at` on all records.** Ensures Supabase sync is additive and conflict-safe without schema rewrites.

### 5.3 Database schema (Postgres via Supabase)

```sql
-- Users (managed by Supabase Auth; extended with profile table)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  weight REAL,
  height REAL,
  activity_level TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User goals
CREATE TABLE user_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  calorie_goal INTEGER NOT NULL,
  protein_goal INTEGER NOT NULL,
  carb_goal INTEGER NOT NULL,
  fat_goal INTEGER NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Foods (USDA + custom user-created)
CREATE TABLE foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id), -- NULL for global USDA foods
  name TEXT NOT NULL,
  brand TEXT,
  serving_size REAL,
  serving_unit TEXT,
  calories REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL,
  fiber REAL,
  sugar REAL,
  sodium REAL,
  source TEXT, -- 'usda', 'open_food_facts', 'custom'
  barcode TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Food logs
CREATE TABLE food_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  food_id UUID REFERENCES foods(id) NOT NULL,
  date DATE NOT NULL,
  meal_slot TEXT NOT NULL, -- 'breakfast', 'lunch', 'dinner', 'snacks'
  serving_amount REAL NOT NULL,
  serving_unit TEXT NOT NULL,
  calories REAL NOT NULL,
  protein REAL NOT NULL,
  carbs REAL NOT NULL,
  fat REAL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exercise logs
CREATE TABLE exercise_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  date DATE NOT NULL,
  exercise_name TEXT NOT NULL,
  exercise_type TEXT NOT NULL, -- 'strength', 'cardio'
  sets INTEGER,
  reps INTEGER,
  weight REAL,
  duration_minutes INTEGER,
  distance_km REAL,
  calories_burned REAL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weight entries
CREATE TABLE weight_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  date DATE NOT NULL,
  weight REAL NOT NULL,
  unit TEXT DEFAULT 'lbs',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Water logs
CREATE TABLE water_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  date DATE NOT NULL,
  amount_ml REAL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.4 Local SQLite schema (cache + offline layer)

Mirrors the Postgres schema above with an additional `synced BOOLEAN DEFAULT FALSE` column on `food_logs` and `exercise_logs`. The sync service reads unsynced rows, pushes to Supabase, and marks them synced.

---

## 6. Design and UX principles

- **Clean, modern mobile aesthetic.** Generous whitespace, clear typography, restrained color palette. No visual clutter.
- **Speed over friction.** Logging a meal should never take more than 3 taps + search. No unnecessary confirmation dialogs.
- **Progress-forward UI.** The dashboard should feel motivating and rewarding, not shaming. Colors and copy reflect encouragement.
- **No dark patterns.** No forced upgrade prompts, no ads, no deceptive UI. Account prompts are soft and skippable for a first session.
- **Platform-appropriate feel.** The app should feel at home on iOS, Android, and web without looking like a lowest-common-denominator cross-platform app.
- **Accessible.** Text sizing respects system accessibility settings. Touch targets meet platform minimums. Color choices maintain contrast ratios.

A Frontend PRD defines individual screens, component inventory, and the design system in detail.

---

## 7. Success metrics

- **Core loop completion rate:** percentage of new users who complete their first food log within 5 minutes of account creation
- **D7 retention:** percentage of users who log at least one meal in each of their first 7 days
- **Daily logging rate:** average number of meal logs per active user per day
- **Search-to-log conversion:** percentage of food searches that result in a logged entry
- **Crash-free session rate:** target >99.5%
- **App Store rating:** target 4.5+

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| USDA data gaps for packaged foods | Add Open Food Facts as a secondary data source; barcode scan covers most packaged products |
| PWA storage cleared on iOS Safari | Supabase sync ensures no data loss; communicate this clearly in onboarding |
| Supabase outage affecting sync | Local SQLite always remains readable; sync retries on reconnect |
| App Store rejection | Follow Apple HIG, include privacy policy, use Supabase Auth's Apple Sign-In correctly |
| Scope creep | Hold firm on non-goals list; any new feature goes through a written decision before implementation |

---

## 9. Roadmap

| Release | Scope |
|---|---|
| v1.0 | Full core: accounts, food logging, dashboard, history, barcode scanning, custom foods, exercise logging, water tracking, dark mode |
| v1.1 | Progress analytics (weight chart, trend lines, streaks), notifications, data export |
| v1.2 | Recipe builder, meal templates, copy-day functionality |
| v2.0 | Premium tier, social/sharing features, wearable integrations |

---

## 10. Open questions

- **App name and brand direction** -- not yet defined
- **Calorie burn calculation method** for strength training (EPOC-based estimate vs. omitting burn for strength)
- **Open Food Facts API** rate limits and reliability as a barcode fallback
- **Analytics provider** -- PostHog vs. Supabase-native event tracking vs. Firebase
- **Web-specific UX** -- should the PWA have a sidebar nav on desktop widths, or stay mobile-layout-only?

# Product Requirements Document (PRD)
## Fitness & Nutrition Tracking App — MVP

---

**Document status:** Draft v1.0
**Owner:** Tim
**Last updated:** April 16, 2026
**Scope:** MVP (v1.0)

---

## 1. Overview

### 1.1 Product summary
A mobile-first fitness and nutrition tracking app that lets users log meals, track daily nutrition against goals, and build awareness of their eating habits. Modeled in spirit on MyFitnessPal but built with a cleaner, modern mobile UX and a simpler, focused feature set for the MVP.

### 1.2 Problem statement
Existing nutrition trackers are either bloated with features, cluttered with ads, or gated behind paywalls. Casual users who want to understand what they eat — without committing to a complex system — lack a lightweight, polished option.

### 1.3 Goals
- Ship a functional meal-logging MVP in a focused timeframe with minimal architectural debt.
- Prove the core loop: *search food → log it → see progress toward daily goals*.
- Establish a clean foundation that can scale to accounts, cloud sync, and social features later.

### 1.4 Non-goals (MVP)
- User accounts and authentication
- Cloud sync across devices
- Exercise tracking and calorie burn
- Social features, friends, sharing
- Barcode scanning (deferred to v1.1)
- Recipe builder / custom meal composition (deferred)
- Water tracking, macro coaching, AI suggestions

---

## 2. Target user

**Primary persona:** The Casual Tracker
A health-conscious adult (25–45) who wants to understand their eating patterns without the friction of a full-featured tracker. They've tried MyFitnessPal, found it overwhelming or ad-heavy, and churned. They want something simple, fast, and visually pleasant — a tool they actually open daily.

**Key user needs:**
- Log a meal in under 15 seconds
- See at a glance whether they're on track for the day
- Trust that the nutrition data is accurate (USDA-backed)
- Not be nagged to create an account before they get value

---

## 3. Core user flows (MVP)

1. **First launch** → brief onboarding (set daily calorie + macro goals) → home screen
2. **Log a meal** → tap meal slot (breakfast/lunch/dinner/snack) → search food → select → set serving size → confirm
3. **Review day** → home screen shows calories remaining, macro breakdown, and meals logged
4. **View history** → scroll back to previous days to see past logs
5. **Adjust goals** → settings → update calorie/macro targets

---

## 4. Feature requirements

### 4.1 Must-have (MVP)

**Onboarding**
- 3-screen onboarding: welcome, set goals (calories + macros), done
- Optional basic stats input (weight, height, activity level) to auto-suggest calorie goal
- All data stored locally; no account required

**Food database & search**
- Pre-loaded subset of USDA FoodData Central (bundled with app or fetched on first launch)
- Text search across food names with fast local lookup
- Show per-serving nutrition: calories, protein, carbs, fat (minimum)
- Support common serving sizes (grams, cups, pieces)

**Meal logging**
- Four meal slots: breakfast, lunch, dinner, snacks
- Add food → adjust serving size → save
- Edit or delete logged items
- "Recent foods" and "frequent foods" for quick re-logging

**Daily dashboard (home screen)**
- Calories consumed vs. goal (primary visual)
- Macro breakdown (protein/carbs/fat) with progress rings or bars
- Meals logged for the day, grouped by slot
- Quick-add button always accessible

**History**
- Calendar or scrollable day view to navigate past days
- Each past day shows the same dashboard summary

**Settings**
- Update daily calorie and macro goals
- Update personal stats
- View app info / version

### 4.2 Nice-to-have (if time permits)
- Dark mode
- Custom food entry (user-created foods stored locally)
- Export data as CSV

### 4.3 Explicitly deferred (post-MVP)
Accounts/auth, cloud sync, barcode scanning, recipes, exercise tracking, social features, notifications/reminders, water tracking, photos of meals.

---

## 5. Technical approach

### 5.1 Stack
- **Frontend:** React Native + Expo
- **Storage (MVP):** On-device via Expo SQLite (for food database + user logs) and AsyncStorage (for settings/goals)
- **Food data:** USDA FoodData Central — curated subset (~5–10k most common foods) bundled with the app or fetched once on install
- **Backend (MVP):** None
- **Backend (post-MVP):** Supabase + Postgres for accounts, sync, and expanded food data

### 5.2 Key architectural decisions
- **Local-first:** MVP works fully offline. No network dependency for core flows.
- **SQLite over AsyncStorage for structured data:** Food search and log queries need real query performance; AsyncStorage is only for simple key/value settings.
- **Schema designed for future sync:** Local tables use UUIDs and `updated_at` timestamps from day one so migration to Supabase is additive, not a rewrite.
- **No auth in MVP:** A device-level anonymous ID ties local data together. When accounts launch, existing local data can be claimed on sign-up.

### 5.3 Data model (MVP, local SQLite)

**`foods`**
- `id` (UUID), `name`, `brand`, `serving_units`, `calories`, `protein`, `carbs`, `fat`, `source` (USDA id)

**`food_logs`**
- `id` (UUID), `date`, `meal_slot`, `food_id`, `serving_amount`, `serving_unit`, `created_at`, `updated_at`

**`user_goals`**
- `calorie_goal`, `protein_goal`, `carb_goal`, `fat_goal`, `updated_at`

**`user_profile`**
- `weight`, `height`, `activity_level`, `updated_at`

---

## 6. Design & UX principles

- **Clean, modern mobile aesthetic** — generous whitespace, clear typography, restrained color palette
- **Speed over features** — logging a meal should never take more than 3 taps + search
- **Progress-forward UI** — the dashboard should feel rewarding, not shaming
- **No dark patterns** — no forced accounts, no upsell pressure, no ads in MVP

A dedicated Frontend PRD will define screens, components, and the design system.

---

## 7. Success metrics

Since there's no backend or analytics in MVP, success metrics are proxy-based and qualitative:
- **Completion of core loop:** can a new user log their first meal within 60 seconds of opening the app?
- **Daily logging retention** (manual tester tracking): does a test user log meals on 5 of 7 consecutive days?
- **Polish bar:** does the app feel on par with modern consumer apps in onboarding, animation, and responsiveness?

Post-MVP will add real analytics (likely PostHog or Supabase-integrated event tracking).

---

## 8. Risks & open questions

### Risks
- **USDA data volume:** bundling the full dataset bloats app size. Mitigation: curate to top ~5–10k foods or fetch-on-install.
- **No-auth local-only data:** users lose data if they delete/reinstall. Mitigation: make this clear in onboarding; prioritize auth + sync for v1.1.
- **Scope creep:** meal tracking apps grow features quickly. Mitigation: hold the line on the deferred list above.

### Open questions
- **App name / brand direction** — not yet defined
- **Target user profile** — persona above is a working draft; needs validation
- **Launch platform priority** — iOS first, Android first, or both simultaneously via Expo?
- **Food database strategy** — curated bundle vs. fetch-on-install vs. hybrid?

---

## 9. Roadmap (high-level)

- **v1.0 (MVP):** This document — local-first meal tracking, no accounts
- **v1.1:** Accounts + Supabase sync, barcode scanning
- **v1.2:** Recipe builder, custom foods sync, basic analytics
- **v2.0:** Exercise tracking, social/community features, premium tier

---

## 10. Next deliverables

With the PRD set, the logical next artifacts are:
1. **Frontend PRD** — screen-by-screen breakdown, component inventory, design system
2. **Screen map & user flows** — visual flow of every MVP screen
3. **Implementation roadmap** — sequenced build order with milestones

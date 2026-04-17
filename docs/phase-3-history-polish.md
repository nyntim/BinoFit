# Phase 3 — History & Polish

**Scope:** History view, UX refinement, nice-to-haves if time permits

**Depends on:** Phase 2 (logging + dashboard complete)

---

## Goals
Make the app feel complete and shippable. History gives the app long-term value; polish makes it feel consumer-grade.

## Features

### History
- Calendar or scrollable day view to navigate past days
- Each past day shows the same dashboard summary (calories, macros, meals logged)
- Read-only — no editing past logs from history view (editing happens on the day's dashboard)

### Polish & Accessibility
- Smooth transitions between screens
- Empty states (no foods logged, no history yet)
- Error states (food search returns nothing)
- Loading states for any async ops (DB seed, search)
- Onboarding can be revisited / skipped on re-launch

### Nice-to-Have (if time permits)
- Dark mode (theme already scaffolded in the codebase)
- Custom food entry (user-created foods stored locally in `foods` table with `source = 'custom'`)
- Export data as CSV

## Explicitly Deferred (post-MVP)
Accounts/auth, cloud sync (Supabase), barcode scanning, recipes, exercise tracking, social features, notifications, water tracking, meal photos.

## Done When
- User can scroll back to any previous day and see their logged meals + totals
- App handles empty and error states gracefully
- Core loop (Phase 2) feels polished enough for a real user to use daily
- Dark mode works if implemented (uses existing `useThemeColor` / `useColorScheme` hooks)

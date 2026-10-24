# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It holds the rules that apply to every task, the commands, a short overview and an index of the per-area docs in `docs/architecture/`. Read the area doc before changing that area.

## Working Style

- **Complex tasks**: Always create a todo list using `TaskCreate` at the start, update each task to `in_progress` when starting it, and mark `completed` when done.
- **Commit messages**: Never include any reference to Claude, AI, or assistant-generated content (no "Claude", no `claude.ai` URLs, no session links) in commit messages.
- **Branch names**: Never include "claude" or any AI/assistant reference in branch names.
- **Commit author**: Never use "Claude" or any AI identity as the git commit author. Always use the repo owner's identity.
- **Keep docs current**: when a change alters behavior described in a `docs/architecture/` doc, update that doc in the same commit. Add to this file only rules that apply across areas, plus a Where to look line for a new area.

## Development Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start Metro dev server (iOS/Android only; `expo.platforms` excludes web) |
| `npm run ios` | Open iOS simulator |
| `npm run android` | Open Android emulator |
| `npm run lint` | Run ESLint |
| `npx tsc --noEmit` | Typecheck |
| `npm test` | Run tests (Jest) |
| `npm run ship -- <cmd>` | Parallel feature worktrees (`start`, `status`, `rebase`, `land`, `clean`); see `docs/agents/ship.md` |

## Overview

BinoFit is a local-first Expo / React Native nutrition and training tracker for iOS and Android.

- **Routing**: Expo Router v6, file-based routes in `app/`. Four tabs, always shown: Nutrition (`index`), Training, Progress, Settings. Other screens are registered on the root Stack in `app/_layout.tsx`.
- **Platform files**: `.ios.tsx`, `.android.tsx` and `.web.ts` suffixes are resolved by Metro. Use them instead of `Platform.OS` branching when behaviors diverge. Training, Spotify, barcode scanning and HealthKit are native only.
- **Path aliases**: `@/*` maps to the repo root. Import as `@/components/...`, `@/lib/...`, `@/hooks/...`, not with relative paths.
- **Theming**: `constants/theme.ts` (palette, macro colors, fonts), `hooks/use-theme-color.ts`, `ThemedText` / `ThemedView`. Use `useThemeColor` in components; don't read `Colors` directly.
- **Storage**: SQLite (`lib/database.ts`, `lib/weight.ts`, `lib/workouts/`) for foods, logs, meals, weight and training; AsyncStorage (`lib/storage.ts`) for goals, profile and device preferences; Supabase (`lib/supabase.ts`, `lib/sync.ts`) for cloud sync and backup. Every install has a Supabase session (anonymous, email or Apple).
- **Key files**: `lib/types.ts` (types), `supabase/schema.sql` (Supabase schema and RLS), `app.json` (Expo config), `eslint.config.js`, `tsconfig.json` (strict). Env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`.

## Rules for every change

- **Home navigation**: every navigation to the app's home uses `homeRouteFor()` from `lib/tracking-mode.ts`, never a literal tab path.
- **Deletes tombstone**: deleting a synced row sets `deleted_at` through `lib/tombstones.ts` and never calls Supabase directly. Every read of `food_logs` (and every other tombstoned table) filters `deleted_at IS NULL`; a missed filter resurrects deleted data. Writes to a log guard `deleted_at IS NULL`. New synced tables follow the same rules and are allow-listed in `lib/tombstones.ts`.
- **Sync after writes**: call `syncToSupabase()` from `@/lib/sync` fire-and-forget after every write to synced data. Never await it inline.
- **Schemas in step**: a change to a synced table updates `lib/types.ts`, the SQLite schema (with a migration for existing installs) and `supabase/schema.sql` together. Supabase SQL a client depends on is applied before that client is released.
- **Units**: weight is stored in kg and distance in metres; convert only for display through `lib/units.ts`.
- **Preferences**: read device preferences with `usePreferences` (`lib/app-preferences.ts`).
- **`fullScreenModal` safe area**: `SafeAreaView` can report zero insets the first time a native `fullScreenModal` opens on iOS, putting the header under the status bar and Dynamic Island (hit in `barcode-scanner.tsx` and `workout/session.tsx`). In any `fullScreenModal` screen, pad the root `View` with `useSafeAreaInsets()` instead.
- **Meal names**: meals are user-defined. Resolve names with `nameForDate` / `mealsForDay` from `@/lib/meals` (via `@/hooks/useMealDefinitions`); never hardcode slot labels.
- **Liquid Glass**: only on the main bottom navigation. Headers, buttons, sheets, rest controls and keyboard accessories use plain or solid theme surfaces; no shared glass wrappers (ADR 0014).
- **Design**: follow the invariants in `DESIGN.md` and reuse its baseline tokens and components. Improving on the baseline is welcome: add new tokens or patterns to the theme and `DESIGN.md` in the same change. Mockups in `docs/design/` are references, not specs.
- **Decisions**: a change that makes or reverses a product, architecture or design decision adds an ADR in `docs/decisions/` (template in its README).

## Where to look

| Area | Doc |
|------|-----|
| Routes, tab bar, Liquid Glass, navigation conventions | `docs/architecture/navigation.md` |
| Data model types | `docs/architecture/data-model.md` |
| SQLite API, tombstones, Supabase sync, sync status, RLS, CSV export | `docs/architecture/data-and-sync.md` |
| Identity, email and Apple accounts, restore, sign-out wipe | `docs/architecture/auth.md` |
| App preferences, units, Settings screens, home routing | `docs/architecture/preferences.md` |
| Nutrition dashboard, meals, reminders, meal summary, food search, barcode scan, nutrients, custom foods | `docs/architecture/nutrition.md` |
| Weight log and trend | `docs/architecture/weight.md` |
| Training: schema, exercise library, workout editor, records, Training tab, live session, rest timer, routines | `docs/architecture/training.md` |
| Progress tab, streaks, expenditure, training charts | `docs/architecture/progress.md` |
| Spotify and Apple Health | `docs/architecture/integrations.md` |
| Product principles, design system, open design questions | `PRODUCT.md`, `DESIGN.md`, `docs/design/README.md` |
| Redesign implementation (boards per screen, build directions) | `docs/design/redesign/README.md` |
| Decision records (why things are the way they are) | `docs/decisions/` |
| Requirements and roadmap | `PRD_v2.md` |
| Agent roles and workflows | `docs/agents/README.md`, `docs/agents/ship.md` |

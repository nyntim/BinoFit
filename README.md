# Science-Based Fitness

A lightweight, USDA-backed meal and nutrition tracking app for iOS, Android, and web. Built with React Native and Expo — no account required, no ads, fully local.

## Features

- **Onboarding** — set daily calorie and macro goals on first launch
- **Food search** — fast local search against a USDA FoodData Central dataset
- **Meal logging** — log food across breakfast, lunch, dinner, and snacks; edit or delete entries
- **Daily dashboard** — calorie ring, macro breakdown bar, and a full list of meals logged
- **History** — scroll back to any previous day to review past logs
- **Settings** — adjust calorie and macro targets at any time
- **Fully local** — all data stored on-device via SQLite; no account or network required

## Getting started

```bash
npm install
npm start          # interactive: choose iOS, Android, web, or Expo Go
```

Platform shortcuts:

```bash
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run web        # browser
```

## Project structure

```
app/               # File-based routes (Expo Router)
  (tabs)/          # Bottom-tab navigator (dashboard, settings)
  onboarding/      # Welcome → goals → complete flow
  food-search.tsx  # Food database search
  serving-picker.tsx
  custom-food.tsx
  day-detail.tsx
components/        # Reusable UI
  calorie-ring.tsx
  macro-bar.tsx
  month-calendar.tsx
  themed-text.tsx / themed-view.tsx
  ui/              # Platform-specific icons (SF Symbols on iOS, Material Icons elsewhere)
lib/
  database.ts      # SQLite schema + queries
  storage.ts       # AsyncStorage wrapper
  types.ts         # Shared TypeScript types
constants/
  theme.ts         # Color palette and fonts (light + dark)
hooks/
  use-theme-color.ts        # Component-level theme accessor
  use-color-scheme.ts/.web.ts
docs/              # Phased implementation plans
```

## Development commands

| Command | Description |
|---|---|
| `npm start` | Start Metro dev server |
| `npm run ios` | Open iOS simulator |
| `npm run android` | Open Android emulator |
| `npm run web` | Open in browser |
| `npm run lint` | Run ESLint |

## Architecture notes

**Theming** — three-layer system: `constants/theme.ts` (palette) → `hooks/use-theme-color.ts` (accessor) → `ThemedText` / `ThemedView` (components). Use `useThemeColor` in components; don't read `Colors` directly.

**Platform files** — `.ios.tsx` / `.web.ts` suffixes are resolved automatically by Metro. Use this pattern instead of `Platform.OS` branching when behaviors diverge meaningfully (see `icon-symbol.ios.tsx`, `use-color-scheme.web.ts`).

**Path aliases** — `@/*` maps to the repo root. Use `@/components/...`, `@/lib/...`, `@/hooks/...` rather than relative paths.

**New Architecture** — `newArchEnabled: true` in `app.json`; any native module added must be Fabric/TurboModules compatible.

## Tech stack

- React Native 0.81.5 + Expo ~54 (managed workflow)
- Expo Router ~6 — file-based routing with typed routes
- expo-sqlite ~16 — local relational storage
- AsyncStorage — lightweight key-value preferences
- TypeScript strict mode + React Compiler enabled

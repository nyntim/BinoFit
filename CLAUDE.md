# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Science-Based-Fitness is an Expo (React Native) application bootstrapped from `create-expo-app`. It targets iOS, Android, and web from a single codebase using Expo Router's file-based routing. The repo currently holds the default starter template — feature code has not yet been added.

## Commands

- `npm install` — install dependencies
- `npx expo start` (or `npm start`) — start the Metro dev server; choose iOS, Android, web, or Expo Go from the output
- `npm run ios` / `npm run android` / `npm run web` — start directly on a specific platform
- `npm run lint` — run `expo lint` (ESLint flat config extending `eslint-config-expo`)
- `npm run reset-project` — **destructive**: moves `/app`, `/components`, `/hooks`, `/constants`, `/scripts` into `/app-example` (or deletes them) and regenerates a blank `/app`. Only run when the user explicitly wants to discard the starter template.

There is no test runner configured in this project.

## Architecture

### Routing (Expo Router)

Routes live under `app/` and are generated from the filesystem:

- `app/_layout.tsx` — root `Stack` navigator; wraps the app in `ThemeProvider` keyed off `useColorScheme()`. `unstable_settings.anchor = '(tabs)'` makes the tab group the default screen.
- `app/(tabs)/_layout.tsx` — bottom-tab navigator. `(tabs)` is a route group (parentheses = no URL segment). Tab buttons use `HapticTab` for tactile feedback and `IconSymbol` for platform-appropriate icons.
- `app/modal.tsx` — registered in the root stack with `presentation: 'modal'`.
- Typed routes are enabled (`app.json` → `experiments.typedRoutes`), so route strings are type-checked. React Compiler is also enabled (`experiments.reactCompiler`).

### Theming

The theming system has three layered pieces that are easy to confuse:

1. `constants/theme.ts` — source of truth for `Colors.light`/`Colors.dark` and platform-specific `Fonts`.
2. `hooks/use-color-scheme.ts` re-exports RN's hook on native; `hooks/use-color-scheme.web.ts` overrides it to avoid SSR/hydration mismatches by returning `'light'` until hydrated.
3. `hooks/use-theme-color.ts` — component-level accessor: takes optional `{ light, dark }` overrides and a `colorName` key from `Colors`. Prefer this over reading `Colors` directly so per-component overrides keep working.

`ThemedText` and `ThemedView` are the canonical ways to apply theme-aware colors; `ThemedText` also owns the typography scale (`default` | `title` | `defaultSemiBold` | `subtitle` | `link`).

### Platform-specific files

Expo's Metro resolver picks `.ios.tsx` / `.web.ts` / etc. automatically. Existing examples:

- `components/ui/icon-symbol.ios.tsx` uses native SF Symbols via `expo-symbols`; `components/ui/icon-symbol.tsx` is the Android/web fallback that maps SF Symbol names to `MaterialIcons`. **When adding a new icon, update the `MAPPING` object in `icon-symbol.tsx`** or the fallback will render nothing.
- `hooks/use-color-scheme.web.ts` vs `hooks/use-color-scheme.ts` as described above.

Follow this pattern (don't branch on `Platform.OS` inside a shared file) when native/web behaviors diverge meaningfully.

### Path aliases

`tsconfig.json` maps `@/*` → repo root. Use `@/components/...`, `@/hooks/...`, `@/constants/...` rather than relative paths.

### New Architecture & Edge-to-Edge

`app.json` sets `newArchEnabled: true` (React Native Fabric/TurboModules) and `android.edgeToEdgeEnabled: true`. Any native module added must be compatible with the New Architecture.

## Conventions

- Component filenames are kebab-case (`themed-text.tsx`, `haptic-tab.tsx`); exported components are PascalCase.
- TypeScript `strict` is on; prefer explicit prop types extending the underlying RN prop type (see `ThemedTextProps extends TextProps`).
- Native `ios/` and `android/` folders are gitignored — this is a managed/prebuild workflow; do not commit generated native projects.

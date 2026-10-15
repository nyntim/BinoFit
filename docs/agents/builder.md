# Role: Builder

You implement an approved plan in BinoFit. Read `CLAUDE.md` first, and `DESIGN.md` before any UI work. Follow the plan; if it turns out to be wrong or incomplete, stop and report instead of improvising a different design.

## Data layer (`lib/`, `services/`, `supabase/`)
- **Keep the three storage layers distinct.** SQLite (`lib/database.ts`) holds foods and logs, AsyncStorage (`lib/storage.ts`) holds goals, profile and preferences, and Supabase is used only for cloud sync. The app must work fully offline.
- **Migrations must be safe for existing installs.** Never drop or recreate tables that hold user data. Add columns with defaults and guard them with existence checks.
- **Keep the schemas in step.** A change to a synced table updates `lib/types.ts`, `lib/database.ts` and `supabase/schema.sql` together. New synced rows need `updated_at` and `synced_at` handling.
- **Sync is fire-and-forget.** Call `syncToSupabase()` after writes without awaiting it; `lib/sync.ts` never throws.
- `user_id` is the device UUID from `lib/device-id.ts`. There is no auth.
- Use parameterized SQL only. Never interpolate values into query strings.

## UI layer (`app/`, `components/`, `hooks/`)
- **Theming**: colors come from `useThemeColor`, `ThemedText` and `ThemedView`. Never hardcode hex values or read `Colors` directly. Every screen must work in light and dark mode.
- **Tokens**: use the spacing, radius and type scale in `DESIGN.md`. Macro colors are only for macro data.
- **Voice**: sharp, precise, quiet. No motivational, celebratory or judgmental copy. State numbers plainly.
- **Platforms**: use `.ios.tsx` / `.web.ts` file suffixes instead of `Platform.OS` branching when behavior really differs. HealthKit is iOS-only.
- **Navigation**: `router.push()` and `router.back()`. The current day comes from `@/context/DateContext`.
- Components call functions in `lib/` and never contain SQL.
- Reuse existing components (`calorie-ring`, `macro-bar`, `CalendarWidget` and so on) before creating new ones.
- **Accessibility**: give icon-only controls an `accessibilityLabel`, make touch targets at least 44pt, and meet WCAG AA contrast.

## Always
- Use `@/` import aliases.
- Before reporting, run `npm run lint` and `npx tsc --noEmit` and fix anything you introduced.
- Do not commit, push or create branches. The lead does that.
- **Report**: the files you changed, any new or changed function signatures, migration notes, and what needs checking by hand on a device.

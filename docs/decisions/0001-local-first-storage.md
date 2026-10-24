# 0001. Local-first storage with cloud backup

- **Status:** Accepted, amended 2026-10
- **Date:** 2026-04-17
- **Links:** `docs/architecture/data-and-sync.md`, `docs/architecture/auth.md`

## Context
Logging happens in short bursts, often with poor signal. The app has to open and log instantly, and a first-time user should not hit an account wall.

## Decision
The device is the source of truth. SQLite holds foods, logs, meals, weight and training; AsyncStorage holds goals, profile and device preferences. Rows use UUIDs and `updated_at` from the start so a cloud copy can be added without reshaping data.

**Amended:** Supabase was originally deferred past the MVP. It now backs up every install: each install signs in anonymously and can later attach an email or Apple account. Sync pushes local changes; restore pulls them onto a new device. There is still no live pull sync between two active devices.

## Alternatives considered
- Server-first with offline cache: simpler multi-device story, but slow cold starts and an account wall.
- Local only: no backup, data lost with the phone.

## Consequences
- Every write to synced data is followed by a fire-and-forget `syncToSupabase()`.
- Schema changes touch SQLite (with a migration), `lib/types.ts` and `supabase/schema.sql` together.
- Two devices used at once can diverge until one restores.

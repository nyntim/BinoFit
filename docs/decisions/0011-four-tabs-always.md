# 0011. Four tabs, always shown

- **Status:** Accepted
- **Date:** 2026-10-17
- **Links:** `docs/architecture/navigation.md`, `lib/tracking-mode.ts`

## Context
The tracking-mode setting (0010) hid tabs, which made features hard to find and added branching to routing and Settings.

## Decision
Nutrition, Training, Progress and Settings are always shown. Navigation to home still goes through `homeRouteFor()` so the home route can change in one place. Any leftover `tracking_mode` key is removed on load.

## Alternatives considered
- Keep the setting but default to both: still leaves the branching and the discoverability problem for those who change it.

## Consequences
- Each tab must make sense for someone who does not use it much: empty states invite, they do not nag.

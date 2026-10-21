---
name: test-backfill
description: Add tests for existing BinoFit code, setting up Jest first if needed. Use when the user asks to backfill tests, add test coverage, or set up testing.
---

Follow `docs/agents/cursor.md`.

Spawn `test-engineer` with `model: composer-2.5-fast` to backfill tests. Scope: the user's request. If no scope was given, start with the pure logic in `lib/` (totals, serving conversions, dates), then `hooks/useStreak.ts`.

When it finishes, report the tests added, pass/fail results, and any bugs the tests found to the user. Don't fix those bugs in this step; list them for the user to decide on. Don't commit unless the user asks.

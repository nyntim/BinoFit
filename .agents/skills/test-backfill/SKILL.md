---
name: test-backfill
description: Add tests for existing BinoFit code, setting up Jest first if needed. Use when the user asks to backfill tests, add test coverage, or set up testing.
---

Read `docs/agents/codex.md` for model selection, role launches, continuations, workspace isolation and authorization. Use the configured roles; do not inherit the lead model for the planner. Higher-priority session instructions take precedence over shared workflow defaults.



Spawn `test-engineer` to backfill tests. Scope: the user's request and any supplied scope. If no scope was given, start with the pure logic in `lib/` (totals, serving conversions, dates), then `hooks/useStreak.ts`.

When it finishes, report the tests added, pass/fail results, and any bugs the tests found to the user. Don't fix those bugs in this step; list them for the user to decide on. Don't commit unless the user asks.

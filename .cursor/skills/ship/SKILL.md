---
name: ship
description: Build several BinoFit features in parallel in Cursor — Grok 4.7 plans, Composer teams, then land each on main one at a time with conflicts resolved. Use when the user gives a list of features or tasks to build at once, or asks for parallel teams. In Claude Code, use .claude/skills/ship instead.
---

You are the lead in Cursor. Tasks: the user's list.

Read `docs/agents/ship.md` and follow it exactly. It is the source of truth for the steps, the stops, conflict rules, and the report. Also follow `docs/agents/cursor.md`. Ignore `.claude/skills/ship`.

- **Roles** are the Task subagents `planner`, `builder`, and `reviewer`. Do not set `environment: cloud`. `scripts/agents/ship.sh` owns the worktrees, and every role prompt starts with the workspace sentence from step 4.
- **Models.** Pass `grok-4.7-high-fast` for every new `planner` call, including conflict resolution. Pass `composer-2.5-fast` for `builder` and `reviewer`. Omit `model` on `resume`.
- **Parallelism.** In step 1, spawn all planners in one message. In step 4, set `run_in_background: true` and advance each team as its agents report back, so one slow team never blocks the others. You'll be notified when each finishes. Don't poll.
- **Relay and fixes.** Resume the existing role instead of spawning a fresh one.
- **Conflicts.** Apply only the mechanical rows in `docs/agents/ship.md` yourself. Any other conflict, including the same function or component changed by both sides, goes to that task's planner.
- **Stops.** Only the ones in `docs/agents/ship.md` (a plan that needs approval, a blocker you can't resolve, pushing). Everything else (worktrees, commits in worktrees, rebases, landing on local `main`) proceeds without asking and without status updates.

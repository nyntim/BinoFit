---
name: ship
description: Build several BinoFit features in parallel — plan approval only when needed, a git worktree and agent team per feature, then land each on main one at a time with conflicts resolved. Use when the user gives a list of features or tasks to build at once, or asks for parallel teams.
---

Read `docs/agents/codex.md` for model selection, role launches, continuations, workspace isolation and authorization. Use the configured roles; do not inherit the lead model for the planner. Higher-priority session instructions take precedence over shared workflow defaults.



You are the lead. Tasks: the user's request and any supplied scope

Read `docs/agents/ship.md` and follow it exactly. It is the source of truth for the steps, the stops, conflict rules and the report. Also follow the lead rules in [Keeping the lead cheap](../../../docs/agents/README.md#keeping-the-lead-cheap). Codex specifics (launch and continue roles as described in `docs/agents/codex.md`):

- **Roles** are the subagents `planner`, `builder` and `reviewer`. Don't use automatic worktree isolation; `scripts/agents/ship.sh` owns the worktrees, and every role prompt starts with the workspace sentence from step 4.
- **Parallelism**: in step 1, launch planners concurrently up to the available agent slots; queue the rest. In step 4, run teams concurrently within the available agent slots and advance each team as its agents report back, so one slow team never blocks the others. Use completion notifications or the available agent wait tool; avoid busy polling.
- **Relay** (step 6): continue a running or finished role with the continuation tools in `docs/agents/codex.md` instead of spawning a fresh one, so it keeps its context.
- **Stops**: only the ones in `docs/agents/ship.md` (a plan that needs approval, a blocker you can't resolve, pushing). Everything else (worktrees, commits in worktrees, rebases, landing on local `main`) proceeds without asking and without status updates to the user.

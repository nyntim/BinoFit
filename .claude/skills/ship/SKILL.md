---
name: ship
description: Build several BinoFit features in parallel — plan approval only when needed, a git worktree and agent team per feature, then land each on main one at a time with conflicts resolved. Use when the user gives a list of features or tasks to build at once, or asks for parallel teams.
model: sonnet
---

In Cursor, stop and follow `.cursor/skills/ship/SKILL.md` instead of this file.

You are the lead. Tasks: $ARGUMENTS

Read `docs/agents/ship.md` and follow it exactly. It is the source of truth for the steps, the stops, conflict rules and the report. Also follow the lead rules in [Keeping the lead cheap](../../../docs/agents/README.md#keeping-the-lead-cheap). Claude Code specifics:

- **Roles** are the subagents `planner`, `builder` and `reviewer`. Don't use the Agent tool's worktree isolation; `scripts/agents/ship.sh` owns the worktrees, and every role prompt starts with the workspace sentence from step 4.
- **Parallelism**: in step 1, spawn all planners in one message. In step 4, run teams as background agents and advance each team as its agents report back, so one slow team never blocks the others. You'll be notified when each finishes; don't poll.
- **Relay** (step 6): continue a running or finished role with `SendMessage` instead of spawning a fresh one, so it keeps its context.
- **Stops**: only the ones in `docs/agents/ship.md` (a plan that needs approval, a blocker you can't resolve, pushing). Everything else (worktrees, commits in worktrees, rebases, landing on local `main`) proceeds without asking and without status updates to the user.

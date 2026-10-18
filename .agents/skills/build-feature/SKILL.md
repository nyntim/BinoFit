---
name: build-feature
description: Build a BinoFit feature end to end with the agent team — plan, approval only when needed, branch, build with tests, one combined review, fix loop, single commit. Use when the user asks to build, implement or ship a feature or PRD item.
---

Read `docs/agents/codex.md` for model selection, role launches, continuations, workspace isolation and authorization. Use the configured roles; do not inherit the lead model for the planner. Higher-priority session instructions take precedence over shared workflow defaults.



You are the lead. Build this with the agent team: the user's request and any supplied scope

The workflow is described in `docs/agents/README.md`. Follow these steps in order, and follow the lead rules in [Keeping the lead cheap](../../../docs/agents/README.md#keeping-the-lead-cheap): work silently and only write to the user when you stop or at the end.

1. **Plan.** Pick a descriptive slug (lowercase, dashes, no mention of AI or assistants). Spawn `planner` with the request and the plan path `<repo root>/.plans/<slug>.md`. It writes the plan there and returns a short summary.
2. **Approve only if needed.** If the summary says `Needs approval: no`, approve it yourself and continue without writing to the user. If it says `yes`, stop: give the user the plan path, the summary and the reason, and wait. If they ask for changes, send them to the same `planner` with the continuation tools in `docs/agents/codex.md`.
3. **Branch.** Make sure the working tree is clean, run `git fetch origin`, and create the branch `<slug>` from `origin/main`.
4. **Build.** Spawn `builder` with the plan path. It writes the plan's tests too.
5. **Review.** Spawn `reviewer` on the branch diff. It covers QA, and design when `app/` or `components/` changed.
6. **Fix (one round).**
   - Send only the blocking findings to the same `builder` with the continuation tools in `docs/agents/codex.md`, so it keeps its context.
   - Then ask the same `reviewer` (with the continuation tools in `docs/agents/codex.md`) to re-check only those findings. Anything still blocking goes in the report; don't start a second round unless the user asks.
   - Don't fix non-blocking findings; list them in the report.
7. **Deliver.**
   - Run lint, typecheck and tests one final time, showing only the result: `(npm run lint && npx tsc --noEmit && npm test -- --ci) > .plans/<slug>.checks.log 2>&1 && echo PASS || tail -n 40 .plans/<slug>.checks.log`.
   - Stage everything and make **one commit**. The pre-commit hook bumps the version on every commit, so one commit means one bump.
   - Follow the commit rules in `CLAUDE.md`: a plain descriptive message with no reference to AI or assistants and no co-author trailer, authored as the repo owner.
   - Don't push or open a PR unless the user asks.
8. **Report.** One short block: branch, what changed (a few lines), checks result, unresolved findings, and what to check by hand on a device.

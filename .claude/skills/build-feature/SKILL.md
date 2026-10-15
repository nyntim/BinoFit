---
name: build-feature
description: Build a BinoFit feature end to end with the agent team — plan, approval, branch, build, tests, design + QA review, fix loop, single commit. Use when the user asks to build, implement or ship a feature or PRD item.
---

You are the lead. Build this with the agent team: $ARGUMENTS

The workflow is described in `docs/agents/README.md`. Follow these steps in order.

1. **Plan.** Spawn `planner` with the request. Show the user the full plan.
2. **Approve.** Stop and wait for the user to approve. This is the only point where you stop. If they ask for changes, send them back to `planner` and show the revised plan.
3. **Branch.** Make sure the working tree is clean, run `git fetch origin`, and create a descriptive feature branch from `origin/main`. The branch name must not mention AI or assistants.
4. **Build.**
   - Spawn `builder` with the approved plan and the relevant file paths.
   - Then spawn `test-engineer` with the plan's Tests section and the builder's report. If no test runner exists, it sets one up first.
5. **Review.** Spawn `qa-reviewer` on the branch diff. In the same message, also spawn `design-reviewer` if any file under `app/`, `components/` or `hooks/` changed. They run in parallel.
6. **Fix loop (at most 2 rounds).**
   - Send blocking findings to `builder`, or to `test-engineer` for test problems.
   - Then run only the reviewers that had findings again.
   - Stop after 2 rounds. Don't fix non-blocking nitpicks; list them in the report instead.
7. **Deliver.**
   - Run `npm run lint`, `npx tsc --noEmit` and `npm test` one final time.
   - Stage everything and make **one commit**. The pre-commit hook bumps the version on every commit, so one commit means one bump.
   - Follow the commit rules in `CLAUDE.md`: a plain descriptive message with no reference to AI or assistants and no co-author trailer, authored as the repo owner.
   - Don't push or open a PR unless the user asks.
8. **Report.** Give the branch name, what changed, test results, review outcomes (including any unresolved findings), and what to check by hand on a device.

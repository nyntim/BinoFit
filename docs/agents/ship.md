# Workflow: Ship (several features in parallel)

You are the **lead**. The user gives you a list of tasks. You plan them, get one approval, give each task its own team and workspace, run the teams in parallel, and land the results on `main` one at a time. The user talks only to you.

This file is tool-agnostic. The git mechanics live in `scripts/agents/ship.sh` (also `npm run ship -- <command>`), so any agent that can run a shell can follow it. Role definitions are in this folder ([README](README.md)).

## Shape

```
User ──tasks──▶ Lead
                 │
                 ├── 1. PLAN      one planner per task, in parallel (read-only)
                 ├── 2. APPROVE   ✋ all plans + overlap map + landing order, in one stop
                 ├── 3. START     ship.sh start <slug>  → .worktrees/<slug> on its own branch
                 ├── 4. BUILD     per team, in parallel, inside its worktree:
                 │                builder → test engineer → QA ∥ design review → fix (≤2 rounds)
                 ├── 5. COMMIT    one commit per team, in its worktree
                 ├── 6. RELAY     shared-surface changes passed between teams by the lead
                 ├── 7. LAND      in order: ship.sh rebase → resolve → ship.sh land
                 ├── 8. PUSH      ✋ only if the user says so; then ship.sh clean
                 └── 9. REPORT
```

The user is stopped twice at most: plan approval, and pushing. Everything in between runs without asking.

## 1. Plan

- Split the request into tasks. Give each a **slug** (`meal-photos`, `water-reminders`): lowercase, digits and dashes. The slug is also the branch name, so it must not mention AI or assistants.
- Run one **planner** per task in parallel, from the main checkout. Planners don't edit files, so they don't need a worktree.
- If the request is ambiguous enough that plans would diverge, ask before planning, not after.

## 2. Approve (the one planning stop)

Show the user, in one message:

1. **Each plan**, in full.
2. **Overlap map**: every file that more than one plan touches, and who touches it. Watch `lib/database.ts` (migrations and schema), `lib/types.ts`, `supabase/schema.sql`, `lib/sync.ts`, `lib/storage.ts`, `constants/theme.ts`, shared components, and `package.json` (new dependencies).
3. **Landing order**: smallest and least risky first, and anything others depend on before its dependents. If two tasks change the same function heavily, say so and propose running the second **after** the first lands rather than in parallel.
4. **Parallelism**: run at most **3 teams at once** by default (each worktree runs its own `npm ci`, lint, typecheck and tests). Queue the rest.

Wait for approval. If the user changes a plan, re-run that planner only.

## 3. Start a workspace per task

```sh
scripts/agents/ship.sh start <slug>        # prints the absolute worktree path
```

This fetches, checks that local `main` isn't behind `origin/main`, creates `.worktrees/<slug>` on branch `<slug>` from `main`, and runs `npm ci` there. `.worktrees/` is ignored by git, tsc, ESLint, Jest and Metro in the main checkout. To run the app from a worktree, copy `.env` into it first.

## 4. Build (teams in parallel)

For each task, run the single-feature steps from the [README workflow](README.md#workflow) (BUILD, REVIEW, FIX), with every role pointed at that task's worktree. Start every role prompt with:

> Your workspace is `<absolute worktree path>`. Read, edit and run commands only inside it; `cd` there before any shell command and use absolute paths under it for file edits. The main checkout and other worktrees belong to other teams; don't touch them. The approved plan is: …

- **Builder** gets the plan. **Test engineer** gets the plan's Tests section and the builder's report. **QA reviewer** reviews `git -C <path> diff main` (plus untracked files). **Design reviewer** runs only if the diff touches `app/`, `components/` or `hooks/`.
- Fix loop: at most 2 rounds per team, same as the single-feature workflow. Unresolved blocking findings mean that task **does not land**; report it and leave its worktree in place.
- Roles never commit, push or create branches. Only the lead does.

## 5. Commit (one per team)

When a team is done and its checks pass:

```sh
git -C <path> add -A
git -C <path> commit -m "<plain descriptive message>"
```

One commit per feature. The pre-commit hook bumps the version; `ship.sh land` re-bases that bump onto whatever `main` is at landing time, so don't fix versions by hand. Commit rules from `CLAUDE.md` apply: no AI or assistant references, no co-author trailer, authored as the repo owner.

## 6. Relay between teams

Teams don't talk to each other directly; the lead is the source of truth. When a team's report shows a change to a **shared surface** (an exported function signature, a type in `lib/types.ts`, a migration, a synced table, a shared component's props, a new dependency), tell every other active team whose plan touches that area: what changed, in which file, and whether they should adapt now or at landing. If the tool supports messaging between running agents, use it for this; otherwise include it in the next instruction you give that team.

## 7. Land, one at a time, in the approved order

For each finished team:

```sh
scripts/agents/ship.sh rebase <slug>   # exit 2 = conflicts, listed
scripts/agents/ship.sh land <slug>     # re-bump version, lint + tsc + tests, fast-forward main
```

`land` refuses unless the branch is exactly one commit on top of current `main`. It fast-forwards, so `main` stays linear with one commit per feature. Nothing is pushed.

**Resolving conflicts** (inside the worktree, then `git add` and `git -C <path> -c core.editor=true rebase --continue`):

| Conflict | Resolution |
|---|---|
| `version` in `package.json`, `app.json`, `package-lock.json` | Take either side; `land` rewrites it. |
| `package-lock.json` beyond the version | Take `main`'s, then `npm install` in the worktree to re-add this branch's dependencies, and `git add` it. |
| `package.json` dependencies | Keep both sides' entries. |
| Migrations in `lib/database.ts` (`ALTER TABLE … ADD COLUMN`) and `supabase/schema.sql` | Keep both sides' lines. They're idempotent and order-independent. |
| `lib/types.ts`, imports, lists of exports | Keep both sides. |
| The same function or component changed by both | Combine both intents, using both approved plans as the spec. If they can't both hold, stop and ask the user. |

If `land` reports failing checks, send the failures to that team's **builder** (same worktree), then `git -C <path> add -A && git -C <path> commit --amend --no-edit` and run `land` again. Two failed attempts: stop landing that task and report it.

After each landing, `main` has moved, so every remaining team rebases at its own turn. That's the point of landing one at a time.

## 8. Push and clean up

Don't push unless the user asks. When they do, push `main`, then remove each landed workspace:

```sh
scripts/agents/ship.sh clean <slug>    # only works once the branch is on main
scripts/agents/ship.sh status          # anything left over
```

## 9. Report

One section per task: branch, what changed, landed or not (and why), version it landed as, test results, review outcomes including unresolved non-blocking findings, conflicts resolved during landing and how, and what to check by hand on a device. End with whether `main` was pushed.

## Running this in different tools

The steps above need two abilities: running a shell, and running a role as a separate agent. How each tool does the second:

- **Claude Code**: `/ship <tasks>`. Roles are subagents in `.claude/agents/`, run in the background so teams proceed in parallel. Subagents can't start their own subagents, so the lead runs each team's steps itself.
- **Tools with sub-agents or parallel tasks** (for example Codex, Cursor background agents, Gemini CLI): ask the main session to "follow `docs/agents/ship.md` as the lead for these tasks: …". Give each role its file from this folder plus the workspace sentence from step 4.
- **Tools without sub-agents**: the lead still plans, starts the worktrees and lands. Run each team as its own session opened in `.worktrees/<slug>`, told to act as each role in turn for that one task. Tell the lead when a team is done.

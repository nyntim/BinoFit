# BinoFit Agent Team

These are role definitions for AI coding agents working on BinoFit. The role files are not tied to any tool, so any agent that can read the repo can follow them.

| Role | File | Edits files? | Job |
|---|---|---|---|
| Planner | [planner.md](planner.md) | No | Turns a request into a file-level plan |
| Builder | [builder.md](builder.md) | Yes | Implements the approved plan |
| Test engineer | [test-engineer.md](test-engineer.md) | Test files only | Backfills tests for existing code (`/test-backfill`); its conventions also guide the builder's tests |
| Reviewer | [reviewer.md](reviewer.md) | No | Reviews a change in one pass: QA, plus design when the UI changed |
| QA reviewer | [qa-reviewer.md](qa-reviewer.md) | No | Finds bugs and code-quality problems (`/bug-sweep`; its focus areas also guide the reviewer) |
| Design reviewer | [design-reviewer.md](design-reviewer.md) | No | Checks UI against `DESIGN.md` and `PRODUCT.md` (`/design-audit`; also guides the reviewer) |

## Workflow

```
You ──request──▶ Lead
                  │
                  ├── 1. PLAN       planner writes .plans/<slug>.md, returns a summary
                  ├── 2. APPROVE    ✋ only if the plan has open questions or touches
                  │                 schema, migrations, sync or tombstones; else the lead approves
                  ├── 3. BRANCH     the lead creates a feature branch
                  ├── 4. BUILD      builder implements and writes the plan's tests
                  ├── 5. REVIEW     reviewer: QA, plus design if app/ or components/ changed
                  ├── 6. FIX        blocking findings → same builder → re-check (one round;
                  │                 anything still unresolved is reported to you)
                  └── 7. DELIVER    one commit on the branch, plus a short report
```

## Models

| Who | Model | Why |
|---|---|---|
| Lead (`/build-feature`, `/ship`) | Sonnet | Mostly coordination: spawning, relaying, running scripts |
| Planner | Opus | Runs once per feature; a bad plan costs more in rebuilds than Opus costs |
| Builder, reviewer, QA reviewer, design reviewer, test engineer | Sonnet | Follow a plan or a checklist |

Skills can't set the lead's effort, and their `model` may not hold after a stop, so start a build session with `/model sonnet` and `/effort medium`.

## Keeping the lead cheap

The lead's cost is mostly re-reading its own context on every turn, so keep that context small and the turns few.

- **Work silently.** Write to the user only when you stop (a plan that needs approval, a blocker you can't resolve, a push) and in the final report. No status updates, no narration between steps.
- **Plans travel by file.** The planner writes `.plans/<slug>.md` and returns a five-line summary; the builder reads the file. Don't read the full plan unless you have to show it to the user.
- Don't read source files, diffs or full command output yourself. The roles do that and report back. Pipe long commands through `tail` or into a log, and look at the log only on failure.
- Pass findings to roles by quoting only what that role needs (only the blocking findings).
- Continue a role with `SendMessage` for fixes instead of spawning a fresh one.
- **Escalate to Opus instead of guessing.** If a rebase conflict, or a disagreement between a reviewer and the builder, touches sync, schema, migrations or tombstones (`lib/sync.ts`, `lib/database.ts`, `lib/tombstones.ts`, `supabase/schema.sql`, `lib/workouts/`), send it to `planner` with both sides and apply the resolution it proposes.
- A long session is fine; Claude Code compacts it when it fills. Short reports and few turns are what keep each turn cheap.

To build **several features in parallel**, follow [ship.md](ship.md): one approval for all the plans, a git worktree and team per feature, then each lands on `main` one at a time. The git steps are scripted in `scripts/agents/ship.sh`.

Standalone audits change no code. They each return a ranked list of findings:
- **Design audit**: the design reviewer checks existing screens.
- **Bug sweep**: the QA reviewer checks existing code.
- **Test backfill**: the test engineer adds tests for existing code, starting with `lib/`.

## Using the roles in different tools

- **Claude Code** runs this workflow automatically. The agents in `.claude/agents/` wrap these role files, and the commands are `/build-feature`, `/ship`, `/design-audit`, `/bug-sweep` and `/test-backfill`.
- **Other tools** (Codex, Cursor, Copilot and so on) read `AGENTS.md` at the repo root, which points here. Ask for a role by name, for example: "Act as the QA reviewer in `docs/agents/qa-reviewer.md` and review my diff."

## Rules for every role
- Only the lead (the main session, or you) commits, pushes or creates branches.
- If the lead gives you a workspace path (a worktree under `.worktrees/`), read, edit and run commands only inside it.
- Branch names, commit messages and commit authorship follow `CLAUDE.md`: no references to AI or assistants, and commits are authored by the repo owner.
- Each feature lands as **one commit**, because the pre-commit hook bumps the app version on every commit.

## When to split the builder
Once the app code passes about 10k lines (excluding generated files and the food database), split `builder.md` into a data builder and a UI builder that can work in parallel.

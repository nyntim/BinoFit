# BinoFit Agent Team

These are role definitions for AI coding agents working on BinoFit. The role files are not tied to any tool, so any agent that can read the repo can follow them.

| Role | File | Edits files? | Job |
|---|---|---|---|
| Planner | [planner.md](planner.md) | No | Turns a request into a file-level plan |
| Builder | [builder.md](builder.md) | Yes | Implements the approved plan |
| Test engineer | [test-engineer.md](test-engineer.md) | Test files only | Sets up Jest and writes tests |
| QA reviewer | [qa-reviewer.md](qa-reviewer.md) | No | Finds bugs and code-quality problems |
| Design reviewer | [design-reviewer.md](design-reviewer.md) | No | Checks UI against `DESIGN.md` and `PRODUCT.md` |

## Workflow

```
You ──request──▶ Lead
                  │
                  ├── 1. PLAN       planner writes the plan
                  ├── 2. APPROVE    ✋ you approve it (the only stop)
                  ├── 3. BRANCH     the lead creates a feature branch
                  ├── 4. BUILD      builder implements → test engineer writes tests
                  ├── 5. REVIEW     QA reviewer ∥ design reviewer (read-only)
                  ├── 6. FIX        findings → builder → re-review (at most 2 rounds;
                  │                 anything still unresolved is reported to you)
                  └── 7. DELIVER    one commit on the branch, plus a report
```

Standalone audits change no code. They each return a ranked list of findings:
- **Design audit**: the design reviewer checks existing screens.
- **Bug sweep**: the QA reviewer checks existing code.
- **Test backfill**: the test engineer adds tests for existing code, starting with `lib/`.

## Using the roles in different tools

- **Claude Code** runs this workflow automatically. The agents in `.claude/agents/` wrap these role files, and the commands are `/build-feature`, `/design-audit`, `/bug-sweep` and `/test-backfill`.
- **Other tools** (Codex, Cursor, Copilot and so on) read `AGENTS.md` at the repo root, which points here. Ask for a role by name, for example: "Act as the QA reviewer in `docs/agents/qa-reviewer.md` and review my diff."

## Rules for every role
- Only the lead (the main session, or you) commits, pushes or creates branches.
- Branch names, commit messages and commit authorship follow `CLAUDE.md`: no references to AI or assistants, and commits are authored by the repo owner.
- Each feature lands as **one commit**, because the pre-commit hook bumps the app version on every commit.

## When to split the builder
Once the app code passes about 10k lines (excluding generated files and the food database), split `builder.md` into a data builder and a UI builder that can work in parallel.

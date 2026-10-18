# AGENTS.md

Instructions for AI coding agents working in this repository.

## Project context
Read `CLAUDE.md` first. Despite its name, it is the general project guide: architecture, commands, storage layers, conventions and commit rules. All of it applies to any agent. Then read:
- `PRODUCT.md`: who the app is for, and its voice ("sharp, precise, quiet")
- `DESIGN.md`: design tokens and component specs
- `PRD_v2.md`: feature requirements and roadmap

## Agent roles
This repo defines a team of agent roles in [`docs/agents/`](docs/agents/README.md):

- **Planner**: [`docs/agents/planner.md`](docs/agents/planner.md)
- **Builder**: [`docs/agents/builder.md`](docs/agents/builder.md)
- **Reviewer** (QA + design in one pass, for builds): [`docs/agents/reviewer.md`](docs/agents/reviewer.md)
- **Test engineer**: [`docs/agents/test-engineer.md`](docs/agents/test-engineer.md)
- **QA reviewer**: [`docs/agents/qa-reviewer.md`](docs/agents/qa-reviewer.md)
- **Design reviewer**: [`docs/agents/design-reviewer.md`](docs/agents/design-reviewer.md)

When you're asked to take on a role, read its file and follow it. [`docs/agents/README.md`](docs/agents/README.md) describes the full workflow.

In Cursor, follow [`docs/agents/cursor.md`](docs/agents/cursor.md): Grok 4.7 for planning and conflict resolution, Composer for the lead and every other role. The skills are in `.cursor/skills/`. Claude Code keeps `.claude/agents/` and `.claude/skills/`.

In Codex, follow [`docs/agents/codex.md`](docs/agents/codex.md): Astra for planning and conflict resolution, Sol for the lead and all other roles. Roles are in `.codex/agents/`; the five workflow skills are in `.agents/skills/`.

To build several features at once, act as the lead in [`docs/agents/ship.md`](docs/agents/ship.md): each feature gets its own git worktree and team, and the results land on `main` one at a time. The git steps are scripted in `scripts/agents/ship.sh` (`npm run ship -- <command>`).

## Rules for every agent
- Run `npm run lint` and `npx tsc --noEmit` before reporting work as done.
- Don't commit, push or create branches unless the user asks you to.
- Never mention AI or assistants in commit messages or branch names, and never set an AI identity as the commit author.

# Cursor

Role files in this folder, and [ship.md](ship.md), stay the source of truth for steps, stops, and conflict rules. This file is how a Cursor lead runs them. Claude Code keeps using `.claude/agents/` and `.claude/skills/`.

## Models

Start the lead chat on **Composer**. This file cannot switch the chat model.

| Who | Model | Task `model` slug |
|---|---|---|
| Lead (this chat) | Composer | — |
| Planner, including the hard conflicts [ship.md](ship.md) sends to the planner | Grok 4.7 | `grok-4.7-high-fast` |
| Builder, reviewer, QA reviewer, design reviewer, test engineer | Composer | `composer-2.5-fast` |

Those slugs are pinned in `.cursor/agents/`, which overrides `.claude/agents/` of the same name. Still pass `model` on every **new** Task call, because an omitted model inherits the parent chat. Omit `model` when `resume` is set; the earlier model stays.

## Launching a role

Use the Task tool. Do not use Claude Code's Agent tool, `SendMessage`, `/model`, or `/effort`.

On every new launch:

- `subagent_type`: `planner`, `builder`, `reviewer`, `qa-reviewer`, `design-reviewer`, or `test-engineer`
- `model`: the slug in the table above
- Do not set `environment`. Never `cloud`. `scripts/agents/ship.sh` owns worktrees.
- The prompt has to stand alone. The subagent does not see this chat. Include the role file path, the plan path, the workspace sentence from [ship.md](ship.md) when there is a worktree, and exactly what to return.

Spawn parallel roles in one message. For ship step 4, set `run_in_background: true` and advance each team when it reports back. Do not poll. In Multitask Mode, every Task call is background.

Continue a role with `resume` set to its agent id. That is the Cursor equivalent of `SendMessage`.

Subagents cannot start their own subagents. The lead runs each step.

When a report names a role, link it as `[Name](id)` using the id the Task tool returned.

## Conflicts

Follow the conflict table in [ship.md](ship.md). The lead resolves every row itself, including two sides changing the same function or component. Resume the planner only for the last row, and for a reviewer/builder disagreement on sync, schema, migrations, or tombstones. Apply the resolution it returns.

## Skills

| Ask | Skill |
|---|---|
| One feature | `.cursor/skills/build-feature` |
| Several features at once | `.cursor/skills/ship` |
| Design audit | `.cursor/skills/design-audit` |
| Bug sweep | `.cursor/skills/bug-sweep` |
| Test backfill | `.cursor/skills/test-backfill` |

In Cursor, ignore the `.claude/skills` copy of the same name.
